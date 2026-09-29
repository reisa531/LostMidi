#include "common/ApiController.h"
#include "common/Json.h"
#include "common/FileEncoding.h"
#include "common/Transaction.h"
#include "common/Log.h"
#include "midi/MidiImportService.h"
#include "storage/IObjectStorage.h"
#include <span>
#include <regex>
#include <sstream>

namespace lostmidi {
namespace {
std::int64_t positiveId(const std::string& value) {
    std::int64_t id = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), id);
    if (error != std::errc{} || end != value.data() + value.size() || id < 1) throw ApiError(400, "INVALID_INPUT", "A positive id or revision is required.");
    return id;
}
std::string filenameOf(const std::string& encoded) {
    if (encoded.empty() || encoded.size() > 765) throw ApiError(400, "INVALID_FILE", "Invalid filename header.");
    const auto nibble = [](char c) -> int { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'a' && c <= 'f') return c - 'a' + 10; if (c >= 'A' && c <= 'F') return c - 'A' + 10; return -1; };
    std::string result;
    for (std::size_t i = 0; i < encoded.size(); ++i) {
        if (encoded[i] != '%') { result += encoded[i]; continue; }
        if (i + 2 >= encoded.size() || nibble(encoded[i + 1]) < 0 || nibble(encoded[i + 2]) < 0) throw ApiError(400, "INVALID_FILE", "Invalid filename encoding.");
        result += static_cast<char>((nibble(encoded[i + 1]) << 4) | nibble(encoded[i + 2])); i += 2;
    }
    return result;
}
void validUploadId(const std::string& id) {
    static const std::regex uuid("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    if (!std::regex_match(id, uuid)) throw ApiError(400, "INVALID_INPUT", "Invalid upload id.");
}
constexpr std::size_t chunkSize = 2'000'000;
}
Json::Value ApiController::manageMidiFile(std::int64_t midiId, std::int64_t fileId, std::int64_t revision,
    std::optional<bool> publicDownload) {
    if (midiId < 1 || fileId < 1 || revision < 1) throw ApiError(400, "INVALID_INPUT", "Positive ids and revision are required.");
    std::string key, restoreContent;
    bool removedPublic = false, createdPublic = false;
    try {
        TransactionScope tx(db_);
        const auto parent = tx.db->execSqlSync("SELECT revision FROM midi_entries WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", midiId);
        if (parent.empty()) throw ApiError(404, "MIDI_NOT_FOUND", "Music entry does not exist.");
        if (parent[0]["revision"].as<std::int64_t>() != revision) throw ApiError(409, "STALE_ENTRY", "Music entry changed elsewhere.");
        const auto file = tx.db->execSqlSync("SELECT private_archive_confirmed,storage_key,sha256,file_size FROM midi_files WHERE midi_id=$1 AND id=$2 FOR UPDATE", midiId, fileId);
        if (file.empty()) throw ApiError(404, "FILE_NOT_FOUND", "File does not belong to this music entry.");
        key = file[0]["storage_key"].as<std::string>();
        const auto digest = file[0]["sha256"].as<std::string>();
        const auto size = file[0]["file_size"].as<std::size_t>();
        const bool wasPublic = file[0]["private_archive_confirmed"].as<bool>();
        Json::Value result; result["file_id"] = std::to_string(fileId);
        if (publicDownload) {
            if (wasPublic != *publicDownload) {
                if (*publicDownload) {
                    const auto privateRows = tx.db->execSqlSync("SELECT replace(encode(content,'base64'),chr(10),'') AS content FROM midi_private_files WHERE file_id=$1 FOR UPDATE", fileId);
                    if (privateRows.empty()) throw ApiError(503, "STORAGE_UNAVAILABLE", "Private file content is unavailable.");
                    const auto bytes = midi::decodeMidiContentBase64(privateRows[0]["content"].as<std::string>());
                    if (bytes.size() != size || storage::sha256(bytes) != digest) throw ApiError(503, "STORAGE_UNAVAILABLE", "Private file integrity check failed.");
                    createdPublic = objects_.store(key, bytes);
                    tx.db->execSqlSync("DELETE FROM midi_private_files WHERE file_id=$1", fileId);
                } else {
                    restoreContent = objects_.read(key, size);
                    tx.db->execSqlSync("INSERT INTO midi_private_files(file_id,content) VALUES($1,decode($2,'base64'))", fileId,
                        base64(std::as_bytes(std::span(restoreContent.data(), restoreContent.size()))));
                    objects_.remove(key); removedPublic = true;
                }
                tx.db->execSqlSync("UPDATE midi_files SET private_archive_confirmed=$3 WHERE midi_id=$1 AND id=$2", midiId, fileId, *publicDownload);
                const auto updated = tx.db->execSqlSync("UPDATE midi_entries SET updated_at=updated_at WHERE id=$1 RETURNING revision", midiId);
                result["revision"] = Json::Int64(updated[0]["revision"].as<std::int64_t>());
            } else result["revision"] = Json::Int64(revision);
            result["public_download_enabled"] = *publicDownload;
        } else {
            if (wasPublic) { restoreContent = objects_.read(key, size); objects_.remove(key); removedPublic = true; }
            tx.db->execSqlSync("DELETE FROM midi_files WHERE midi_id=$1 AND id=$2", midiId, fileId);
            const auto updated = tx.db->execSqlSync("UPDATE midi_entries SET updated_at=updated_at WHERE id=$1 RETURNING revision", midiId);
            result["revision"] = Json::Int64(updated[0]["revision"].as<std::int64_t>());
            result["deleted"] = true;
        }
        tx.commit();
        return result;
    } catch (...) {
        try {
            if (removedPublic) objects_.store(key, std::as_bytes(std::span(restoreContent.data(), restoreContent.size())));
            if (createdPublic) objects_.remove(key);
        } catch (...) { logEvent("midi_file_storage_compensation_failed"); }
        throw;
    }
}
void ApiController::registerAdminFileRoutes() {
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/files/{2}", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string midiText, std::string fileText) {
        dispatch(std::move(callback), [this, request, midiText = std::move(midiText), fileText = std::move(fileText)] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            const auto midiId = positiveId(midiText), fileId = positiveId(fileText);
            const auto body = request->getJsonObject();
            if (!body || !body->isObject() || !(*body)["revision"].isInt64() || (*body)["revision"].asInt64() < 1 ||
                (request->method() == drogon::Put && !(*body)["public_download_enabled"].isBool()))
                throw ApiError(400, "INVALID_INPUT", "A revision and valid download setting are required.");
            const auto revision = (*body)["revision"].asInt64();
            Json::Value payload; payload["revision"] = Json::Int64(revision); payload["file_id"] = std::to_string(fileId);
            const auto visibility = request->method() == drogon::Put;
            if (visibility) payload["public_download_enabled"] = (*body)["public_download_enabled"].asBool();
            if (actor.role == "admin") return submitAdminChange(actor, visibility ? "file.visibility" : "file.delete", midiId, payload);
            auto result = manageMidiFile(midiId, fileId, revision,
                visibility ? std::optional<bool>(payload["public_download_enabled"].asBool()) : std::nullopt);
            recordContributor(midiId, actor.username);
            logEvent(visibility ? "midi_file_visibility_changed" : "midi_file_deleted");
            return result;
        });
    }, {drogon::Put, drogon::Delete});
    drogon::app().registerHandler("/api/v1/admin/uploads/{1}/chunks/{2}", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string uploadId, std::string indexText) {
        dispatch(std::move(callback), [this, request, uploadId = std::move(uploadId), indexText = std::move(indexText)] {
            const auto actor = requireFilePrincipal(request);
            validUploadId(uploadId);
            int index = -1;
            const auto [end, error] = std::from_chars(indexText.data(), indexText.data() + indexText.size(), index);
            if (error != std::errc{} || end != indexText.data() + indexText.size() || index < 0 || index > 9)
                throw ApiError(400, "INVALID_INPUT", "Invalid chunk index.");
            if (!importer_.enabled()) throw ApiError(503, "IMPORT_DISABLED", "File import is disabled.");
            if (request->getHeader("content-type") != "application/octet-stream") throw ApiError(415, "INVALID_FILE", "An application/octet-stream body is required.");
            const auto body = request->body();
            if (body.empty() || body.size() > chunkSize) throw ApiError(413, "FILE_TOO_LARGE", "A chunk must be between 1 and 2 MB.");
            db_->execSqlSync("DELETE FROM file_uploads WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day'");
            db_->execSqlSync("INSERT INTO file_uploads(id,username) VALUES($1::uuid,$2) ON CONFLICT(id) DO NOTHING", uploadId, actor.username);
            const auto owner = db_->execSqlSync("SELECT username,completed_response IS NOT NULL AS completed,processing_at IS NOT NULL AS processing FROM file_uploads WHERE id=$1::uuid", uploadId);
            if (owner.empty() || owner[0]["username"].as<std::string>() != actor.username)
                throw ApiError(403, "UPLOAD_FORBIDDEN", "This upload belongs to another account.");
            if (owner[0]["completed"].as<bool>() || owner[0]["processing"].as<bool>())
                throw ApiError(409, "UPLOAD_CLOSED", "This upload is already being finalized.");
            db_->execSqlSync("INSERT INTO file_upload_chunks(upload_id,chunk_index,content) VALUES($1::uuid,$2,decode($3,'base64')) "
                "ON CONFLICT(upload_id,chunk_index) DO UPDATE SET content=EXCLUDED.content", uploadId, index, base64(std::as_bytes(std::span(body.data(), body.size()))));
            Json::Value result; result["received"] = index; return result;
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/uploads/{1}/complete", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string uploadId) {
        if (importsPending_.fetch_add(1) >= 2) {
            --importsPending_;
            Json::Value json; json["error"]["code"] = "SERVER_BUSY"; json["error"]["message"] = "Please retry shortly.";
            auto response = drogon::HttpResponse::newHttpJsonResponse(json); response->setStatusCode(drogon::k503ServiceUnavailable);
            response->addHeader("Cache-Control", "no-store"); callback(response); return;
        }
        auto slot = std::shared_ptr<int>(new int(0), [this](int* p) { delete p; --importsPending_; });
        dispatch(std::move(callback), [this, request, uploadId = std::move(uploadId), slot] {
            const auto actor = requireFilePrincipal(request);
            validUploadId(uploadId);
            const auto body = request->getJsonObject();
            if (!body || !body->isObject() || !(*body)["size"].isUInt() || !(*body)["chunks"].isUInt() ||
                !(*body)["sha256"].isString() || !(*body)["filename"].isString() || !(*body)["rights_confirmed"].isBool())
                throw ApiError(400, "INVALID_INPUT", "Invalid upload metadata.");
            const auto size = (*body)["size"].asUInt();
            const auto count = (*body)["chunks"].asUInt();
            const auto digest = (*body)["sha256"].asString();
            const auto filename = (*body)["filename"].asString();
            const auto publicDownload = (*body)["rights_confirmed"].asBool();
            if (size == 0 || size > midi::maxImportBytes || count != (size + chunkSize - 1) / chunkSize ||
                digest.size() != 64 || digest.find_first_not_of("0123456789abcdef") != std::string::npos)
                throw ApiError(400, "INVALID_INPUT", "Invalid upload size or checksum.");
            midi::validateFilename(filename);
            const auto existing = db_->execSqlSync("SELECT username,completed_response::text AS result FROM file_uploads WHERE id=$1::uuid", uploadId);
            if (existing.empty()) throw ApiError(404, "UPLOAD_NOT_FOUND", "Upload chunks have expired or are missing.");
            if (existing[0]["username"].as<std::string>() != actor.username)
                throw ApiError(403, "UPLOAD_FORBIDDEN", "This upload belongs to another account.");
            if (!existing[0]["result"].isNull()) {
                Json::Value result; Json::CharReaderBuilder reader; std::string errors;
                std::istringstream stream(existing[0]["result"].as<std::string>());
                if (!Json::parseFromStream(reader, stream, &result, &errors)) throw ApiError(503, "UPLOAD_UNAVAILABLE", "Upload receipt is unavailable.");
                return result;
            }
            const auto claimed = db_->execSqlSync("UPDATE file_uploads SET processing_at=CURRENT_TIMESTAMP WHERE id=$1::uuid AND username=$2 "
                "AND completed_response IS NULL AND (processing_at IS NULL OR processing_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes') RETURNING id", uploadId, actor.username);
            if (claimed.empty()) throw ApiError(409, "UPLOAD_BUSY", "The upload is already being finalized.");
            try {
                const auto chunks = db_->execSqlSync("SELECT chunk_index,replace(encode(content,'base64'),chr(10),'') AS content FROM file_upload_chunks WHERE upload_id=$1::uuid ORDER BY chunk_index", uploadId);
                if (chunks.size() != count) throw ApiError(400, "INVALID_FILE", "Upload chunks are incomplete.");
                std::vector<std::byte> bytes; bytes.reserve(size);
                for (std::size_t i = 0; i < chunks.size(); ++i) {
                    if (chunks[i]["chunk_index"].as<int>() != static_cast<int>(i)) throw ApiError(400, "INVALID_FILE", "Upload chunks are out of order.");
                    auto part = midi::decodeMidiContentBase64(chunks[i]["content"].as<std::string>());
                    if (part.empty() || part.size() > chunkSize || (i + 1 < chunks.size() && part.size() != chunkSize))
                        throw ApiError(400, "INVALID_FILE", "Upload chunk size is invalid.");
                    bytes.insert(bytes.end(), part.begin(), part.end());
                }
                if (bytes.size() != size || storage::sha256(bytes) != digest)
                    throw ApiError(400, "INVALID_FILE", "Upload checksum does not match.");
                Json::Value result;
                if ((*body)["mode"] == "create") {
                    result = completeStagedCreate(actor, (*body)["entry"], filename, bytes, publicDownload);
                } else if ((*body)["mode"] == "import") {
                    if (!(*body)["id"].isString() || !(*body)["revision"].isString())
                        throw ApiError(400, "INVALID_INPUT", "An entry id and revision are required.");
                    const auto midiId = positiveId((*body)["id"].asString());
                    const auto revision = positiveId((*body)["revision"].asString());
                    if (actor.role == "admin") {
                        Json::Value payload; payload["revision"] = Json::Int64(revision); payload["filename"] = filename;
                        payload["content_base64"] = base64(bytes); payload["rights_confirmed"] = publicDownload;
                        result = submitAdminChange(actor, "file.import", midiId, payload);
                    } else {
                        const auto imported = importer_.import(midiId, revision, filename, bytes, publicDownload);
                        recordContributor(midiId, actor.username);
                        result["file"] = toJson(imported.file); result["duplicate"] = imported.duplicate;
                        result["revision"] = Json::Int64(imported.revision);
                    }
                } else throw ApiError(400, "INVALID_INPUT", "Invalid upload mode.");
                db_->execSqlSync("UPDATE file_uploads SET completed_response=$2::jsonb,processing_at=NULL WHERE id=$1::uuid", uploadId, result.toStyledString());
                db_->execSqlSync("DELETE FROM file_upload_chunks WHERE upload_id=$1::uuid", uploadId);
                return result;
            } catch (...) {
                db_->execSqlSync("UPDATE file_uploads SET processing_at=NULL WHERE id=$1::uuid AND completed_response IS NULL", uploadId);
                throw;
            }
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/files", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
        // Bound buffered uploads waiting for workers, independently from metadata requests.
        std::shared_ptr<int> slot;
        if (request->method() == drogon::Post) {
            if (importsPending_.fetch_add(1) >= 2) {
                --importsPending_;
                Json::Value json; json["error"]["code"] = "SERVER_BUSY"; json["error"]["message"] = "Please retry shortly.";
                auto response = drogon::HttpResponse::newHttpJsonResponse(json); response->setStatusCode(drogon::k503ServiceUnavailable); response->addHeader("Cache-Control", "no-store"); callback(response); return;
            }
            slot = std::shared_ptr<int>(new int(0), [this](int* p) { delete p; --importsPending_; });
        }
        dispatch(std::move(callback), [this, request, id = std::move(id), slot] {
            const auto actor = requireFilePrincipal(request);
            const auto midiId = positiveId(id);
            Json::Value json;
            if (request->method() == drogon::Get) {
                const auto editor = importer_.get(midiId);
                json["entry"] = toJson(editor.entry); json["files"] = Json::Value(Json::arrayValue);
                for (const auto& file : editor.files) {
                    auto item = toJson(file); item["download_available"] = midi::downloadAllowed(editor.entry, file);
                    json["files"].append(item);
                }
                json["max_file_size"] = Json::UInt64(midi::maxImportBytes); json["enabled"] = importer_.enabled(); return json;
            }
            if (request->getHeader("content-type") != "application/octet-stream") throw ApiError(415, "INVALID_FILE", "An application/octet-stream body is required.");
            const auto body = request->body();
            if (body.empty()) throw ApiError(400, "INVALID_FILE", "Files must not be empty.");
            if (body.size() > midi::maxImportBytes) throw ApiError(413, "FILE_TOO_LARGE", "Files must not exceed 20 MB.");
            if (!importer_.enabled()) throw ApiError(503, "IMPORT_DISABLED", "File import is disabled.");
            const auto filename = filenameOf(request->getHeader("x-file-name"));
            const auto rightsConfirmed = request->getHeader("x-rights-confirmed") == "true";
            const auto revision = positiveId(request->getHeader("x-entry-revision"));
            const auto bytes = std::as_bytes(std::span(body.data(), body.size()));
            if (actor.role == "admin") {
                midi::validateFilename(filename); midi::validateFileContent(bytes);
                Json::Value payload; payload["revision"] = Json::Int64(revision); payload["filename"] = filename;
                payload["content_base64"] = base64(bytes); payload["rights_confirmed"] = rightsConfirmed;
                return submitAdminChange(actor, "file.import", midiId, payload);
            }
            const auto result = importer_.import(midiId, revision, filename, bytes, rightsConfirmed);
            recordContributor(midiId, actor.username);
            json["file"] = toJson(result.file); json["duplicate"] = result.duplicate; json["revision"] = Json::Int64(result.revision);
            logEvent(result.duplicate ? "midi_file_duplicate" : "midi_file_imported"); return json;
        });
    }, {drogon::Get, drogon::Post});
}
}
