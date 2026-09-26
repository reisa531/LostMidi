#include "common/ApiController.h"
#include "common/Json.h"
#include "common/Log.h"
#include "common/Transaction.h"
#include "midi/MidiImportService.h"
#include "storage/IObjectStorage.h"
#include <algorithm>
#include <array>
#include <charconv>
#include <set>
#include <span>

namespace lostmidi {
namespace {
Json::Value bodyOf(const drogon::HttpRequestPtr& request) {
    const auto json = request->getJsonObject();
    if (!json || !json->isObject()) throw ApiError(400, "INVALID_INPUT", "A JSON object is required.");
    return *json;
}
void fieldsOf(const Json::Value& json, const std::set<std::string>& allowed) {
    for (const auto& name : json.getMemberNames())
        if (!allowed.contains(name)) throw ApiError(400, "INVALID_INPUT", "Unknown history field.");
}
std::string stringOf(const Json::Value& json, const char* name) {
    if (!json[name].isString()) throw ApiError(400, "INVALID_INPUT", std::string("Text is required for field: ") + name);
    return json[name].asString();
}
std::optional<std::string> optionalText(const Json::Value& json, const char* name) {
    return json[name].isNull() ? std::nullopt : std::optional<std::string>(stringOf(json, name));
}
std::int64_t idOf(const std::string& value) {
    std::int64_t id = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), id);
    if (error != std::errc{} || end != value.data() + value.size() || id < 1 ||
        !std::all_of(value.begin(), value.end(), [](char c) { return c >= '0' && c <= '9'; }))
        throw ApiError(400, "INVALID_INPUT", "A positive decimal 64-bit id string is required.");
    return id;
}
std::int64_t revisionOf(const Json::Value& json) {
    const auto& revision = json["revision"];
    if ((revision.type() != Json::intValue && revision.type() != Json::uintValue) ||
        !revision.isInt64() || revision.asInt64() < 1)
        throw ApiError(400, "INVALID_INPUT", "A positive integer revision is required.");
    return revision.asInt64();
}
std::string base64(std::span<const std::byte> bytes) {
    constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string output;
    output.reserve(((bytes.size() + 2) / 3) * 4);
    for (std::size_t i = 0; i < bytes.size(); i += 3) {
        const auto a = std::to_integer<unsigned char>(bytes[i]);
        const auto b = i + 1 < bytes.size() ? std::to_integer<unsigned char>(bytes[i + 1]) : 0;
        const auto c = i + 2 < bytes.size() ? std::to_integer<unsigned char>(bytes[i + 2]) : 0;
        output += alphabet[a >> 2]; output += alphabet[((a & 3) << 4) | (b >> 4)];
        output += i + 1 < bytes.size() ? alphabet[((b & 15) << 2) | (c >> 6)] : '=';
        output += i + 2 < bytes.size() ? alphabet[c & 63] : '=';
    }
    return output;
}
std::string safeFilename(const std::string& encoded) {
    if (encoded.empty() || encoded.size() > 765) throw ApiError(400, "INVALID_FILE", "Invalid filename header.");
    const auto nibble = [](char c) -> int { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'a' && c <= 'f') return c - 'a' + 10; if (c >= 'A' && c <= 'F') return c - 'A' + 10; return -1; };
    std::string result;
    for (std::size_t i = 0; i < encoded.size(); ++i) {
        if (encoded[i] != '%') { result += encoded[i]; continue; }
        if (i + 2 >= encoded.size() || nibble(encoded[i + 1]) < 0 || nibble(encoded[i + 2]) < 0) throw ApiError(400, "INVALID_FILE", "Invalid filename encoding.");
        result += static_cast<char>((nibble(encoded[i + 1]) << 4) | nibble(encoded[i + 2])); i += 2;
    }
    if (result.empty() || result.size() > 255 || result == "." || result == ".." ||
        std::any_of(result.begin(), result.end(), [](unsigned char c) { return c < 0x20 || c == 0x7f || c == '/' || c == '\\'; }))
        throw ApiError(400, "INVALID_FILE", "Filename must be a safe basename of at most 255 bytes.");
    return result;
}
std::string encodedFilename(const std::string& value) {
    constexpr char hex[] = "0123456789ABCDEF";
    std::string encoded;
    for (unsigned char c : value) {
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' ) encoded += static_cast<char>(c);
        else { encoded += '%'; encoded += hex[c >> 4]; encoded += hex[c & 15]; }
    }
    return encoded;
}
drogon::HttpResponsePtr evidenceResponse(const drogon::orm::DbClientPtr& db, std::int64_t midiId, std::int64_t evidenceId) {
    const auto rows = db->execSqlSync("SELECT original_filename,media_type,sha256,file_size,replace(encode(content,'base64'),chr(10),'') AS body FROM historical_evidence WHERE midi_id=$1 AND id=$2 AND EXISTS(SELECT 1 FROM midi_entries WHERE id=$1 AND deleted_at IS NULL)", midiId, evidenceId);
    if (rows.empty()) throw ApiError(404, "EVIDENCE_NOT_FOUND", "Evidence file does not exist.");
    const auto bytes = midi::decodeMidiContentBase64(rows[0]["body"].as<std::string>());
    const auto expectedDigest = rows[0]["sha256"].as<std::string>();
    if (bytes.size() != rows[0]["file_size"].as<std::uint32_t>() || storage::sha256(bytes) != expectedDigest)
        throw ApiError(503, "EVIDENCE_INTEGRITY_FAILED", "Evidence file failed its integrity check.");
    const auto filename = rows[0]["original_filename"].as<std::string>();
    auto response = drogon::HttpResponse::newHttpResponse();
    response->setContentTypeString(rows[0]["media_type"].as<std::string>());
    response->addHeader("Content-Disposition", "attachment; filename=\"evidence-" + std::to_string(evidenceId) + "\"; filename*=UTF-8''" + encodedFilename(filename));
    response->addHeader("X-Content-Type-Options", "nosniff");
    response->addHeader("Content-Security-Policy", "sandbox");
    response->setBody(std::string(reinterpret_cast<const char*>(bytes.data()), bytes.size()));
    return response;
}
bool allowedMediaType(const std::string& type) {
    return type == "application/pdf" || type == "image/jpeg" || type == "image/png" || type == "text/plain";
}
void validateEvidenceBytes(const std::string& mediaType, std::span<const std::byte> bytes) {
    if (bytes.empty() || bytes.size() > 1024 * 1024) throw ApiError(bytes.empty() ? 400 : 413, "INVALID_FILE", "Evidence files must contain 1 byte to 1 MiB.");
    if (!allowedMediaType(mediaType)) throw ApiError(415, "INVALID_FILE", "Supported evidence types are PDF, JPEG, PNG, and plain text.");
    const auto byte = [&](std::size_t i) { return std::to_integer<unsigned char>(bytes[i]); };
    if (mediaType == "application/pdf" && (bytes.size() < 5 || std::string_view(reinterpret_cast<const char*>(bytes.data()), 5) != "%PDF-"))
        throw ApiError(400, "INVALID_FILE", "PDF signature is invalid.");
    if (mediaType == "image/png" && (bytes.size() < 8 || byte(0) != 0x89 || byte(1) != 'P' || byte(2) != 'N' || byte(3) != 'G' || byte(4) != 13 || byte(5) != 10 || byte(6) != 26 || byte(7) != 10))
        throw ApiError(400, "INVALID_FILE", "PNG signature is invalid.");
    if (mediaType == "image/jpeg" && (bytes.size() < 3 || byte(0) != 0xff || byte(1) != 0xd8 || byte(2) != 0xff))
        throw ApiError(400, "INVALID_FILE", "JPEG signature is invalid.");
}
std::int64_t advanceEntry(const drogon::orm::DbClientPtr& db, std::int64_t midiId, std::int64_t revision) {
    const auto rows = db->execSqlSync("UPDATE midi_entries SET updated_at=updated_at WHERE id=$1 AND revision=$2 AND deleted_at IS NULL RETURNING revision", midiId, revision);
    if (rows.empty()) throw ApiError(409, "STALE_ENTRY", "Entry changed elsewhere. Reload before saving.");
    return rows[0]["revision"].as<std::int64_t>();
}
recovery::HistoricalSource sourceOf(const Json::Value& json) {
    fieldsOf(json, {"revision", "website_name", "original_url", "first_seen_at", "last_seen_at", "wayback_url", "notes", "source_type", "credibility", "checked_at"});
    recovery::HistoricalSource source;
    source.websiteName = stringOf(json, "website_name");
    source.originalUrl = optionalText(json, "original_url");
    source.firstSeenAt = optionalText(json, "first_seen_at");
    source.lastSeenAt = optionalText(json, "last_seen_at");
    source.waybackUrl = optionalText(json, "wayback_url");
    source.notes = optionalText(json, "notes");
    if (json["source_type"].isString()) source.sourceType = json["source_type"].asString();
    if (json["credibility"].isInt()) source.credibility = json["credibility"].asInt();
    source.checkedAt = optionalText(json, "checked_at");
    return source;
}
recovery::RecoveryEvent eventOf(const Json::Value& json) {
    fieldsOf(json, {"revision", "recovered_at", "recovered_by", "recovered_by_name", "story", "evidence"});
    recovery::RecoveryEvent event;
    event.recoveredAt = optionalText(json, "recovered_at");
    if (!json["recovered_by"].isNull()) event.recoveredBy = idOf(stringOf(json, "recovered_by"));
    if (json.isMember("recovered_by_name") && !json["recovered_by_name"].isNull()) event.recoveredByName = stringOf(json, "recovered_by_name");
    if (event.recoveredBy && event.recoveredByName) throw ApiError(400, "INVALID_INPUT", "Use either recovered_by or recovered_by_name, not both.");
    event.story = stringOf(json, "story");
    event.evidence = optionalText(json, "evidence");
    return event;
}
}  // namespace

void ApiController::registerAdminRecoveryRoutes() {
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/history",
        [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
            dispatch(std::move(callback), [this, request, id = std::move(id)] {
                auth_.require(request->getHeader("authorization"));
                return toJson(recoveryWriter_.getHistory(idOf(id)));
            });
        }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/sources",
        [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
            dispatch(std::move(callback), [this, request, id = std::move(id)] {
                const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
                const auto body = bodyOf(request);
                if (actor.role == "admin") return submitAdminChange(actor, "history.source.create", idOf(id), body);
                const auto result = recoveryWriter_.saveSource(idOf(id), 0, revisionOf(body), sourceOf(body));
                logEvent("historical_source_created");
                return toJson(result);
            }, 201);
        }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/sources/{2}",
        [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id, std::string sourceId) {
            dispatch(std::move(callback), [this, request, id = std::move(id), sourceId = std::move(sourceId)] {
                const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
                auto body = bodyOf(request);
                if (request->method() == drogon::Delete) {
                    fieldsOf(body, {"revision"});
                    if (actor.role == "admin") { body["record_id"] = sourceId; return submitAdminChange(actor, "history.source.delete", idOf(id), body); }
                    const auto result = recoveryWriter_.deleteSource(idOf(id), idOf(sourceId), revisionOf(body));
                    logEvent("historical_source_deleted");
                    return toJson(result);
                }
                if (actor.role == "admin") { body["record_id"] = sourceId; return submitAdminChange(actor, "history.source.update", idOf(id), body); }
                const auto result = recoveryWriter_.saveSource(idOf(id), idOf(sourceId), revisionOf(body), sourceOf(body));
                logEvent("historical_source_updated");
                return toJson(result);
            });
        }, {drogon::Put, drogon::Delete});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/recovery-events",
        [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
            dispatch(std::move(callback), [this, request, id = std::move(id)] {
                const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
                const auto body = bodyOf(request);
                if (actor.role == "admin") return submitAdminChange(actor, "history.event.create", idOf(id), body);
                const auto result = recoveryWriter_.saveEvent(idOf(id), 0, revisionOf(body), eventOf(body));
                logEvent("recovery_event_created");
                return toJson(result);
            }, 201);
        }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/recovery-events/{2}",
        [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id, std::string eventId) {
            dispatch(std::move(callback), [this, request, id = std::move(id), eventId = std::move(eventId)] {
                const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
                auto body = bodyOf(request);
                if (request->method() == drogon::Delete) {
                    fieldsOf(body, {"revision"});
                    if (actor.role == "admin") { body["record_id"] = eventId; return submitAdminChange(actor, "history.event.delete", idOf(id), body); }
                    const auto result = recoveryWriter_.deleteEvent(idOf(id), idOf(eventId), revisionOf(body));
                    logEvent("recovery_event_deleted");
                    return toJson(result);
                }
                if (actor.role == "admin") { body["record_id"] = eventId; return submitAdminChange(actor, "history.event.update", idOf(id), body); }
                const auto result = recoveryWriter_.saveEvent(idOf(id), idOf(eventId), revisionOf(body), eventOf(body));
                logEvent("recovery_event_updated");
                return toJson(result);
            });
        }, {drogon::Put, drogon::Delete});

    const auto uploadEvidence = [this](const drogon::HttpRequestPtr& request, Callback&& callback,
        std::string midiValue, std::string relationId, bool source) {
        if (importsPending_.fetch_add(1) >= 2) {
            --importsPending_;
            Json::Value body; body["error"]["code"] = "SERVER_BUSY"; body["error"]["message"] = "Please retry shortly.";
            auto response = drogon::HttpResponse::newHttpJsonResponse(body); response->setStatusCode(drogon::k503ServiceUnavailable);
            response->addHeader("Cache-Control", "no-store"); callback(response); return;
        }
        auto slot = std::shared_ptr<int>(new int(0), [this](int* value) { delete value; --importsPending_; });
        dispatch(std::move(callback), [this, request, midiValue = std::move(midiValue), relationId = std::move(relationId), source, slot] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            if (request->getHeader("content-type") != "application/octet-stream") throw ApiError(415, "INVALID_FILE", "An application/octet-stream body is required.");
            const auto bytesText = request->body();
            const auto bytes = std::as_bytes(std::span(bytesText.data(), bytesText.size()));
            const auto mediaType = request->getHeader("x-evidence-media-type");
            validateEvidenceBytes(mediaType, bytes);
            const auto filename = safeFilename(request->getHeader("x-file-name"));
            const auto midiId = idOf(midiValue);
            const auto childId = idOf(relationId);
            const auto revision = idOf(request->getHeader("x-entry-revision"));
            const auto digest = storage::sha256(bytes);
            if (actor.role == "admin") {
                Json::Value payload; payload["revision"] = Json::Int64(revision); payload["record_id"] = std::to_string(childId);
                payload["relation_type"] = source ? "source" : "event"; payload["filename"] = filename;
                payload["media_type"] = mediaType; payload["content_base64"] = base64(bytes); payload["sha256"] = digest;
                return submitAdminChange(actor, "evidence.upload", midiId, payload);
            }
            TransactionScope tx(db_);
            const auto parent = tx.db->execSqlSync("SELECT 1 FROM midi_entries WHERE id=$1 AND deleted_at IS NULL FOR SHARE", midiId);
            if (parent.empty()) throw ApiError(404, "MIDI_NOT_FOUND", "MIDI entry does not exist.");
            const auto relationSql = source
                ? "SELECT 1 FROM historical_sources WHERE midi_id=$1 AND id=$2"
                : "SELECT 1 FROM recovery_events WHERE midi_id=$1 AND id=$2";
            if (tx.db->execSqlSync(relationSql, midiId, childId).empty())
                throw ApiError(404, source ? "SOURCE_NOT_FOUND" : "RECOVERY_EVENT_NOT_FOUND", "The evidence parent record does not exist.");
            const auto existing = tx.db->execSqlSync(source
                ? "SELECT id,original_filename,media_type,sha256,file_size,created_at FROM historical_evidence WHERE midi_id=$1 AND source_id=$2 AND sha256=$3"
                : "SELECT id,original_filename,media_type,sha256,file_size,created_at FROM historical_evidence WHERE midi_id=$1 AND recovery_event_id=$2 AND sha256=$3",
                midiId, childId, digest);
            std::int64_t nextRevision = 0;
            drogon::orm::Result saved = existing;
            bool duplicate = !existing.empty();
            if (!duplicate) {
                nextRevision = advanceEntry(tx.db, midiId, revision);
                saved = source
                    ? tx.db->execSqlSync("INSERT INTO historical_evidence(midi_id,source_id,original_filename,media_type,sha256,file_size,content,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,decode($7,'base64'),$8) RETURNING id,original_filename,media_type,sha256,file_size,created_at", midiId, childId, filename, mediaType, digest, static_cast<std::int32_t>(bytes.size()), base64(bytes), actor.username)
                    : tx.db->execSqlSync("INSERT INTO historical_evidence(midi_id,recovery_event_id,original_filename,media_type,sha256,file_size,content,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,decode($7,'base64'),$8) RETURNING id,original_filename,media_type,sha256,file_size,created_at", midiId, childId, filename, mediaType, digest, static_cast<std::int32_t>(bytes.size()), base64(bytes), actor.username);
            }
            tx.commit();
            Json::Value result; result["evidence"] = toJson(recovery::EvidenceFile{saved[0]["id"].as<std::int64_t>(),
                saved[0]["original_filename"].as<std::string>(), saved[0]["media_type"].as<std::string>(),
                saved[0]["sha256"].as<std::string>(), saved[0]["file_size"].as<std::uint32_t>(), saved[0]["created_at"].as<std::string>()});
            result["revision"] = Json::Int64(nextRevision); result["duplicate"] = duplicate;
            logEvent(duplicate ? "historical_evidence_duplicate" : "historical_evidence_uploaded");
            return result;
        }, 201);
    };
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/sources/{2}/evidence",
        [uploadEvidence](const drogon::HttpRequestPtr& request, Callback&& callback, std::string midiId, std::string sourceId) {
            uploadEvidence(request, std::move(callback), std::move(midiId), std::move(sourceId), true);
        }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/recovery-events/{2}/evidence",
        [uploadEvidence](const drogon::HttpRequestPtr& request, Callback&& callback, std::string midiId, std::string eventId) {
            uploadEvidence(request, std::move(callback), std::move(midiId), std::move(eventId), false);
        }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/evidence/{2}",
        [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string midiValue, std::string evidenceValue) {
            dispatchResponse(std::move(callback), [this, request, midiValue = std::move(midiValue), evidenceValue = std::move(evidenceValue)] {
                auth_.require(request->getHeader("authorization"));
                const auto midiId = idOf(midiValue); const auto evidenceId = idOf(evidenceValue);
                return evidenceResponse(db_, midiId, evidenceId);
            });
        }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/midis/{1}/evidence/{2}",
        [this](const drogon::HttpRequestPtr&, Callback&& callback, std::string midiValue, std::string evidenceValue) {
            dispatchResponse(std::move(callback), [this, midiValue = std::move(midiValue), evidenceValue = std::move(evidenceValue)] {
                return evidenceResponse(db_, idOf(midiValue), idOf(evidenceValue));
            });
        }, {drogon::Get});
}
}  // namespace lostmidi
