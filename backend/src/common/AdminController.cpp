#include "common/ApiController.h"
#include "common/Json.h"
#include "common/Log.h"
#include "common/Transaction.h"
#include "auth/Password.h"
#include "storage/IObjectStorage.h"
#include <set>
#include <regex>
#include <span>

namespace lostmidi {
namespace {
Json::Value bodyOf(const drogon::HttpRequestPtr& request) {
    auto json = request->getJsonObject();
    if (!json || !json->isObject()) throw ApiError(400, "INVALID_INPUT", "A JSON object is required.");
    return *json;
}
std::string stringOf(const Json::Value& json, const char* name, std::size_t maximum) {
    if (!json[name].isString() || json[name].asString().size() > maximum)
        throw ApiError(400, "INVALID_INPUT", std::string("Invalid field: ") + name);
    return json[name].asString();
}
std::int64_t idOf(const std::string& value) {
    std::int64_t id = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), id);
    if (error != std::errc{} || end != value.data() + value.size() || id < 1)
        throw ApiError(400, "INVALID_INPUT", "A positive 64-bit id is required.");
    return id;
}
void fieldsOf(const Json::Value& json, const std::set<std::string>& allowed) {
    if (!json.isObject()) throw ApiError(400, "INVALID_INPUT", "Object required.");
    for (const auto& name : json.getMemberNames())
        if (!allowed.contains(name)) throw ApiError(400, "INVALID_INPUT", "Unknown field.");
}
std::int64_t revisionOf(const Json::Value& json) {
    if (!json["revision"].isInt64() || json["revision"].asInt64() < 1)
        throw ApiError(400, "INVALID_INPUT", "A positive revision is required.");
    return json["revision"].asInt64();
}
person::PersonEdit personOf(const Json::Value& json, bool editing) {
    fieldsOf(json, {"display_name", "biography", "summary", "profile", "aliases", "revision"});
    person::PersonEdit edit;
    edit.person.displayName = stringOf(json, "display_name", 300);
    if (!json["biography"].isNull()) edit.person.biography = stringOf(json, "biography", 20000);
    if (json.isMember("summary")) {
        if (!json["summary"].isNull()) edit.person.summary = stringOf(json, "summary", 500);
        edit.summaryProvided = true;
    }
    if (json.isMember("profile")) {
        if (!json["profile"].isObject()) throw ApiError(400, "INVALID_INPUT", "Profile must be an object.");
        Json::StreamWriterBuilder writer; writer["indentation"] = "";
        edit.person.profile = Json::writeString(writer, json["profile"]);
        edit.profileProvided = true;
    }
    if (!json["aliases"].isArray() || json["aliases"].size() > 50)
        throw ApiError(400, "INVALID_INPUT", "Aliases must be an array with at most 50 entries.");
    for (const auto& alias : json["aliases"]) {
        if (!alias.isString()) throw ApiError(400, "INVALID_INPUT", "Alias must be text.");
        edit.aliases.push_back(alias.asString());
    }
    if (editing) edit.person.revision = revisionOf(json);
    return edit;
}
person::CreditEdit creditsOf(const Json::Value& json) {
    fieldsOf(json, {"revision", "credits"});
    person::CreditEdit edit{revisionOf(json), {}};
    if (!json["credits"].isArray() || json["credits"].size() > 100)
        throw ApiError(400, "INVALID_INPUT", "Credits must be an array with at most 100 entries.");
    for (const auto& credit : json["credits"]) {
        fieldsOf(credit, {"person_id", "role"});
        edit.credits.push_back({idOf(stringOf(credit, "person_id", 19)), "", stringOf(credit, "role", 30)});
    }
    return edit;
}
recovery::HistoricalSource sourceOf(const Json::Value& json) {
    fieldsOf(json, {"revision", "record_id", "website_name", "original_url", "first_seen_at", "last_seen_at", "wayback_url", "notes", "source_type", "credibility", "checked_at"});
    recovery::HistoricalSource source;
    source.websiteName = stringOf(json, "website_name", 300);
    const auto optional = [&](const char* name, std::size_t limit) -> std::optional<std::string> {
        if (json[name].isNull()) return std::nullopt;
        return stringOf(json, name, limit);
    };
    source.originalUrl = optional("original_url", 4096); source.firstSeenAt = optional("first_seen_at", 40);
    source.lastSeenAt = optional("last_seen_at", 40); source.waybackUrl = optional("wayback_url", 4096);
    source.notes = optional("notes", 20000); source.checkedAt = optional("checked_at", 40);
    if (json["source_type"].isString()) source.sourceType = json["source_type"].asString();
    if (json["credibility"].isInt()) source.credibility = json["credibility"].asInt();
    return source;
}
recovery::RecoveryEvent eventOf(const Json::Value& json) {
    fieldsOf(json, {"revision", "record_id", "recovered_at", "recovered_by", "recovered_by_name", "story", "evidence"});
    recovery::RecoveryEvent event;
    if (!json["recovered_at"].isNull()) event.recoveredAt = stringOf(json, "recovered_at", 40);
    if (!json["recovered_by"].isNull()) event.recoveredBy = idOf(stringOf(json, "recovered_by", 19));
    if (json.isMember("recovered_by_name") && !json["recovered_by_name"].isNull()) event.recoveredByName = stringOf(json, "recovered_by_name", 300);
    if (event.recoveredBy && event.recoveredByName) throw ApiError(400, "INVALID_INPUT", "Use either recovered_by or recovered_by_name, not both.");
    event.story = stringOf(json, "story", 20000);
    if (!json["evidence"].isNull()) event.evidence = stringOf(json, "evidence", 20000);
    return event;
}
midi::MidiEntry entryOf(const Json::Value& json, bool editing) {
    const std::set<std::string> allowed{"title","slug","description","estimated_year","estimated_date","archive_status","copyright_status","license","rights_holder","distribution_permission","revision"};
    for (const auto& name : json.getMemberNames())
        if (!allowed.contains(name)) throw ApiError(400, "INVALID_INPUT", "Unknown entry field.");
    midi::MidiEntry entry;
    entry.title = stringOf(json, "title", 300);
    entry.slug = stringOf(json, "slug", 160);
    entry.archiveStatus = stringOf(json, "archive_status", 40);
    entry.copyrightStatus = stringOf(json, "copyright_status", 40);
    entry.distributionPermission = stringOf(json, "distribution_permission", 40);
    const auto optionalText = [&](const char* name, std::size_t size) -> std::optional<std::string> {
        return json[name].isNull() ? std::nullopt : std::optional<std::string>(stringOf(json, name, size));
    };
    entry.description = optionalText("description", 20000);
    entry.license = optionalText("license", 500);
    entry.rightsHolder = optionalText("rights_holder", 500);
    if (!json["estimated_year"].isNull()) {
        if (!json["estimated_year"].isInt()) throw ApiError(400, "INVALID_INPUT", "Estimated year must be an integer or null.");
        entry.estimatedYear = json["estimated_year"].asInt();
    }
    entry.estimatedDateProvided = json.isMember("estimated_date");
    if (entry.estimatedDateProvided && !json["estimated_date"].isNull())
        entry.estimatedDate = stringOf(json, "estimated_date", 10);
    if (editing) {
        if (!json["revision"].isInt64() || json["revision"].asInt64() < 1)
            throw ApiError(400, "INVALID_INPUT", "Revision is required for editing.");
        entry.revision = json["revision"].asInt64();
    }
    return entry;
}
}
void ApiController::registerAdminRoutes() {
    drogon::app().registerHandler("/api/v1/admin/changes", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            Json::Value result(Json::arrayValue);
            const auto rows = actor.role == "super_admin"
                ? db_->execSqlSync("SELECT id::text,request_type,entity_id,proposed_by,((payload - 'content_base64') #- '{file,content_base64}')::text AS payload,status,review_note,created_at FROM admin_change_requests WHERE status IN ('pending','reviewing','failed') ORDER BY created_at,id LIMIT 200")
                : db_->execSqlSync("SELECT id::text,request_type,entity_id,proposed_by,((payload - 'content_base64') #- '{file,content_base64}')::text AS payload,status,review_note,created_at FROM admin_change_requests WHERE proposed_by=$1 ORDER BY created_at DESC,id DESC LIMIT 100", actor.username);
            for (const auto& row : rows) {
                Json::Value item; item["id"] = row["id"].as<std::string>(); item["type"] = row["request_type"].as<std::string>();
                item["entity_id"] = nullable<std::int64_t>(row["entity_id"]) ? Json::Value(Json::Int64(*nullable<std::int64_t>(row["entity_id"]))) : Json::Value(Json::nullValue);
                item["proposed_by"] = row["proposed_by"].as<std::string>(); item["payload"] = row["payload"].as<std::string>();
                item["status"] = row["status"].as<std::string>(); item["review_note"] = nullable<std::string>(row["review_note"]).value_or("");
                item["created_at"] = row["created_at"].as<std::string>(); result.append(item);
            }
            return result;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/changes/{1}/review", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string requestId) {
        dispatch(std::move(callback), [this, request, requestId = std::move(requestId)] {
            const auto reviewer = auth_.requireSuperAdmin(request->getHeader("authorization"));
            if (!std::regex_match(requestId, std::regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")))
                throw ApiError(400, "INVALID_INPUT", "A valid request id is required.");
            const auto body = bodyOf(request); fieldsOf(body, {"decision", "note"});
            const auto decision = stringOf(body, "decision", 10);
            if (decision != "approve" && decision != "reject") throw ApiError(400, "INVALID_INPUT", "Decision must be approve or reject.");
            const auto note = body["note"].isNull() ? std::string{} : stringOf(body, "note", 2000);
            TransactionScope claim(db_);
            const auto rows = claim.db->execSqlSync("UPDATE admin_change_requests SET status='reviewing' WHERE id=$1::uuid AND status='pending' RETURNING request_type,entity_id,payload::text,proposed_by", requestId);
            if (rows.empty()) throw ApiError(409, "REQUEST_NOT_PENDING", "This request has already been reviewed or is being handled.");
            const auto type = rows[0]["request_type"].as<std::string>();
            const auto entity = nullable<std::int64_t>(rows[0]["entity_id"]).value_or(0);
            const auto proposedBy = rows[0]["proposed_by"].as<std::string>();
            Json::Value payload; Json::CharReaderBuilder reader;
            std::string parseErrors; std::istringstream input(rows[0]["payload"].as<std::string>());
            if (!Json::parseFromStream(reader, input, &payload, &parseErrors) || !payload.isObject()) throw ApiError(500, "INVALID_REQUEST", "Stored review request is invalid.");
            claim.commit();
            if (decision == "reject") {
                db_->execSqlSync("UPDATE admin_change_requests SET status='rejected',review_note=$2,reviewed_by=$3,reviewed_at=CURRENT_TIMESTAMP WHERE id=$1::uuid", requestId, note, reviewer.username);
            } else {
                try {
                    Json::Value applied;
                    if (type == "midi.create") {
                        auto entryPayload = payload;
                        std::optional<midi::MidiCreationFile> upload;
                        const auto hasRequestId = payload["request_id"].isString();
                        const auto creationRequestId = hasRequestId ? payload["request_id"].asString() : std::string{};
                        if (payload["file"].isObject()) {
                            const auto& file = payload["file"];
                            fieldsOf(file, {"filename", "content_base64", "rights_confirmed"});
                            if (!file["filename"].isString() || !file["content_base64"].isString() || !file["rights_confirmed"].isBool())
                                throw ApiError(400, "INVALID_FILE", "The proposed MIDI file is invalid.");
                            upload.emplace(); upload->filename = file["filename"].asString();
                            upload->bytes = midi::decodeMidiContentBase64(file["content_base64"].asString());
                            upload->rightsConfirmed = file["rights_confirmed"].asBool();
                            entryPayload.removeMember("file");
                        }
                        entryPayload.removeMember("request_id");
                        if (upload || hasRequestId) {
                            if (upload) { midi::validateFilename(upload->filename); midi::validateFileContent(upload->bytes); }
                            applied = toJson(importer_.create(entryOf(entryPayload, false), creationRequestId, upload));
                        }
                        else applied = toJson(writer_.create(entryOf(entryPayload, false)));
                    }
                    else if (type == "midi.update") applied = toJson(writer_.update(entity, entryOf(payload, true)));
                    else if (type == "person.create") applied = toJson(personWriter_.save(0, personOf(payload, false)));
                    else if (type == "person.update") applied = toJson(personWriter_.save(entity, personOf(payload, true)));
                    else if (type == "credits.update") applied = toJson(personWriter_.saveCredits(entity, creditsOf(payload)));
                    else if (type == "midi.delete") {
                        writer_.remove(entity, revisionOf(payload), reviewer.username);
                        applied["deleted_id"] = std::to_string(entity);
                    }
                    else if (type == "person.delete") {
                        personWriter_.remove(entity, revisionOf(payload), reviewer.username);
                        applied["deleted_id"] = std::to_string(entity);
                    }
                    else if (type == "midi.restore" || type == "person.restore") {
                        const bool midiEntity = type == "midi.restore";
                        TransactionScope tx(db_);
                        const auto rows = midiEntity
                            ? tx.db->execSqlSync("UPDATE midi_entries SET deleted_at=NULL,deleted_by=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING title AS label", entity)
                            : tx.db->execSqlSync("UPDATE people SET deleted_at=NULL,deleted_by=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING display_name AS label", entity);
                        if (rows.empty()) throw ApiError(404, "TRASH_RECORD_NOT_FOUND", "The deleted record no longer exists.");
                        tx.db->execSqlSync("INSERT INTO admin_audit_log(actor,action,entity_type,entity_id,entity_label) VALUES($1,'restore',$2,$3,$4)", reviewer.username, midiEntity ? "midi" : "person", entity, rows[0]["label"].as<std::string>());
                        tx.commit(); applied["restored_id"] = std::to_string(entity); applied["entity_type"] = midiEntity ? "midi" : "person";
                    }
                    else if (type == "history.source.create" || type == "history.source.update" || type == "history.source.delete") {
                        const auto revision = revisionOf(payload);
                        const auto recordId = payload["record_id"].isString() ? idOf(payload["record_id"].asString()) : 0;
                        auto body = payload; body.removeMember("record_id");
                        if (type == "history.source.delete") applied = toJson(recoveryWriter_.deleteSource(entity, recordId, revision));
                        else applied = toJson(recoveryWriter_.saveSource(entity, recordId, revision, sourceOf(body)));
                    }
                    else if (type == "history.event.create" || type == "history.event.update" || type == "history.event.delete") {
                        const auto revision = revisionOf(payload);
                        const auto recordId = payload["record_id"].isString() ? idOf(payload["record_id"].asString()) : 0;
                        auto body = payload; body.removeMember("record_id");
                        if (type == "history.event.delete") applied = toJson(recoveryWriter_.deleteEvent(entity, recordId, revision));
                        else applied = toJson(recoveryWriter_.saveEvent(entity, recordId, revision, eventOf(body)));
                    }
                    else if (type == "file.import") {
                        fieldsOf(payload, {"revision", "filename", "content_base64", "rights_confirmed"});
                        const auto filename = stringOf(payload, "filename", 255);
                        const auto encoded = stringOf(payload, "content_base64", ((midi::maxImportBytes + 2) / 3) * 4);
                        if (!payload["rights_confirmed"].isBool()) throw ApiError(400, "INVALID_INPUT", "Distribution confirmation is required.");
                        const auto bytes = midi::decodeMidiContentBase64(encoded);
                        midi::validateFilename(filename); midi::validateFileContent(bytes);
                        if (!payload["rights_confirmed"].asBool()) throw ApiError(400, "RIGHTS_CONFIRMATION_REQUIRED", "Confirm the right to publicly distribute this file.");
                        const auto result = importer_.import(entity, revisionOf(payload), filename, bytes, payload["rights_confirmed"].asBool());
                        applied["file"] = toJson(result.file); applied["duplicate"] = result.duplicate; applied["revision"] = Json::Int64(result.revision);
                    }
                    else if (type == "evidence.upload") {
                        fieldsOf(payload, {"revision", "record_id", "relation_type", "filename", "media_type", "content_base64", "sha256"});
                        const auto recordId = idOf(stringOf(payload, "record_id", 19));
                        const auto relationType = stringOf(payload, "relation_type", 10);
                        if (relationType != "source" && relationType != "event") throw ApiError(400, "INVALID_INPUT", "Evidence relation type is invalid.");
                        const auto filename = stringOf(payload, "filename", 255); const auto mediaType = stringOf(payload, "media_type", 64);
                        const auto bytes = midi::decodeMidiContentBase64(stringOf(payload, "content_base64", 1400000));
                        const auto digest = storage::sha256(bytes);
                        if (digest != stringOf(payload, "sha256", 64) || bytes.empty() || bytes.size() > 1024 * 1024)
                            throw ApiError(400, "INVALID_FILE", "Evidence file integrity check failed.");
                        if (filename.empty() || filename.size() > 255 || filename == "." || filename == ".." ||
                            std::any_of(filename.begin(), filename.end(), [](unsigned char c) { return c < 0x20 || c == 0x7f || c == '/' || c == '\\'; }))
                            throw ApiError(400, "INVALID_FILE", "Evidence filename must be a safe basename of at most 255 bytes.");
                        if (mediaType == "application/pdf") {
                            if (bytes.size() < 5 || !std::equal(bytes.begin(), bytes.begin() + 5, "%PDF-", [](std::byte a, char b) { return std::to_integer<unsigned char>(a) == static_cast<unsigned char>(b); })) throw ApiError(400, "INVALID_FILE", "PDF signature is invalid.");
                        } else if (mediaType == "image/png") {
                            constexpr unsigned char signature[] = {0x89, 'P', 'N', 'G', 13, 10, 26, 10};
                            if (bytes.size() < sizeof(signature) || !std::equal(std::begin(signature), std::end(signature), bytes.begin(), [](unsigned char a, std::byte b) { return a == std::to_integer<unsigned char>(b); })) throw ApiError(400, "INVALID_FILE", "PNG signature is invalid.");
                        } else if (mediaType == "image/jpeg") {
                            if (bytes.size() < 3 || std::to_integer<unsigned char>(bytes[0]) != 0xff || std::to_integer<unsigned char>(bytes[1]) != 0xd8 || std::to_integer<unsigned char>(bytes[2]) != 0xff) throw ApiError(400, "INVALID_FILE", "JPEG signature is invalid.");
                        } else if (mediaType != "text/plain") throw ApiError(415, "INVALID_FILE", "Unsupported evidence media type.");
                        const auto proposedRevision = revisionOf(payload);
                        TransactionScope tx(db_);
                        const auto parent = tx.db->execSqlSync("SELECT 1 FROM midi_entries WHERE id=$1 AND deleted_at IS NULL", entity);
                        if (parent.empty()) throw ApiError(404, "MIDI_NOT_FOUND", "The MIDI entry no longer exists.");
                        const auto relation = relationType == "source"
                            ? tx.db->execSqlSync("SELECT 1 FROM historical_sources WHERE midi_id=$1 AND id=$2", entity, recordId)
                            : tx.db->execSqlSync("SELECT 1 FROM recovery_events WHERE midi_id=$1 AND id=$2", entity, recordId);
                        if (relation.empty()) throw ApiError(404, "HISTORY_RECORD_NOT_FOUND", "The evidence parent record no longer exists.");
                        auto existing = relationType == "source"
                            ? tx.db->execSqlSync("SELECT id,original_filename,media_type,sha256,file_size,created_at FROM historical_evidence WHERE midi_id=$1 AND source_id=$2 AND sha256=$3", entity, recordId, digest)
                            : tx.db->execSqlSync("SELECT id,original_filename,media_type,sha256,file_size,created_at FROM historical_evidence WHERE midi_id=$1 AND recovery_event_id=$2 AND sha256=$3", entity, recordId, digest);
                        if (existing.empty()) {
                            const auto bumped = tx.db->execSqlSync("UPDATE midi_entries SET updated_at=updated_at WHERE id=$1 AND revision=$2 AND deleted_at IS NULL RETURNING revision", entity, proposedRevision);
                            if (bumped.empty()) throw ApiError(409, "STALE_ENTRY", "Entry changed elsewhere. Reload before saving.");
                            const auto encoded = payload["content_base64"].asString();
                            existing = relationType == "source"
                                ? tx.db->execSqlSync("INSERT INTO historical_evidence(midi_id,source_id,original_filename,media_type,sha256,file_size,content,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,decode($7,'base64'),$8) RETURNING id,original_filename,media_type,sha256,file_size,created_at", entity, recordId, filename, mediaType, digest, static_cast<std::int32_t>(bytes.size()), encoded, proposedBy)
                                : tx.db->execSqlSync("INSERT INTO historical_evidence(midi_id,recovery_event_id,original_filename,media_type,sha256,file_size,content,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,decode($7,'base64'),$8) RETURNING id,original_filename,media_type,sha256,file_size,created_at", entity, recordId, filename, mediaType, digest, static_cast<std::int32_t>(bytes.size()), encoded, proposedBy);
                        }
                        tx.commit();
                        applied["evidence"] = toJson(recovery::EvidenceFile{existing[0]["id"].as<std::int64_t>(), existing[0]["original_filename"].as<std::string>(), existing[0]["media_type"].as<std::string>(), existing[0]["sha256"].as<std::string>(), existing[0]["file_size"].as<std::uint32_t>(), existing[0]["created_at"].as<std::string>()});
                    }
                    else throw ApiError(422, "REVIEW_TYPE_UNSUPPORTED", "This request type cannot be approved through the review panel.");
                    db_->execSqlSync("UPDATE admin_change_requests SET status='approved',review_note=$2,reviewed_by=$3,reviewed_at=CURRENT_TIMESTAMP,result=$4::jsonb WHERE id=$1::uuid", requestId, note, reviewer.username, applied.toStyledString());
                } catch (const ApiError& error) {
                    const auto status = (error.code == "STALE_ENTRY" || error.code == "STALE_PERSON") ? "stale" : "failed";
                    db_->execSqlSync("UPDATE admin_change_requests SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=CURRENT_TIMESTAMP WHERE id=$1::uuid", requestId, status, std::string(error.what()).substr(0, 2000), reviewer.username);
                    throw;
                }
            }
            Json::Value result; result["id"] = requestId; result["status"] = decision == "approve" ? "approved" : "rejected"; result["proposed_by"] = proposedBy; return result;
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/trash", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            auth_.require(request->getHeader("authorization"));
            Page page;
            const auto& params = request->getParameters();
            if (params.contains("page")) page.number = positiveInteger(params.at("page"), 1000000, "page");
            if (params.contains("pageSize")) page.size = positiveInteger(params.at("pageSize"), 100, "pageSize");
            const auto rows = db_->execSqlSync(
                "SELECT entity_type,entity_id,entity_label,deleted_at,deleted_by FROM ("
                "SELECT 'midi'::text AS entity_type,id AS entity_id,title AS entity_label,deleted_at,deleted_by FROM midi_entries WHERE deleted_at IS NOT NULL "
                "UNION ALL SELECT 'person',id,display_name,deleted_at,deleted_by FROM people WHERE deleted_at IS NOT NULL) AS trash "
                "ORDER BY deleted_at DESC,entity_type,entity_id LIMIT $1 OFFSET $2",
                static_cast<std::int64_t>(page.size), page.offset());
            const auto count = db_->execSqlSync("SELECT (SELECT count(*) FROM midi_entries WHERE deleted_at IS NOT NULL) + "
                "(SELECT count(*) FROM people WHERE deleted_at IS NOT NULL) AS total")[0]["total"].as<std::int64_t>();
            Json::Value result; result["data"] = Json::Value(Json::arrayValue);
            for (const auto& row : rows) {
                Json::Value item;
                item["entity_type"] = row["entity_type"].as<std::string>();
                item["entity_id"] = std::to_string(row["entity_id"].as<std::int64_t>());
                item["entity_label"] = row["entity_label"].as<std::string>();
                item["deleted_at"] = row["deleted_at"].as<std::string>();
                item["deleted_by"] = row["deleted_by"].as<std::string>();
                result["data"].append(item);
            }
            result["pagination"]["page"] = page.number;
            result["pagination"]["pageSize"] = page.size;
            result["pagination"]["total"] = Json::Int64(count);
            result["audit"] = Json::Value(Json::arrayValue);
            for (const auto& row : db_->execSqlSync("SELECT actor,action,entity_type,entity_id,entity_label,created_at FROM admin_audit_log ORDER BY id DESC LIMIT 50")) {
                Json::Value item;
                item["actor"] = row["actor"].as<std::string>();
                item["action"] = row["action"].as<std::string>();
                item["entity_type"] = row["entity_type"].as<std::string>();
                item["entity_id"] = std::to_string(row["entity_id"].as<std::int64_t>());
                item["entity_label"] = row["entity_label"].as<std::string>();
                item["created_at"] = row["created_at"].as<std::string>();
                result["audit"].append(item);
            }
            return result;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/trash/{1}/{2}/restore", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string type, std::string value) {
        dispatch(std::move(callback), [this, request, type = std::move(type), value = std::move(value)] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            if (type != "midi" && type != "person") throw ApiError(400, "INVALID_INPUT", "Unknown trash record type.");
            const auto id = idOf(value);
            if (actor.role == "admin") {
                return submitAdminChange(actor, type + ".restore", id, Json::Value(Json::objectValue));
            }
            TransactionScope tx(db_);
            const auto rows = type == "midi"
                ? tx.db->execSqlSync("UPDATE midi_entries SET deleted_at=NULL,deleted_by=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING title AS label", id)
                : tx.db->execSqlSync("UPDATE people SET deleted_at=NULL,deleted_by=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING display_name AS label", id);
            if (rows.empty()) throw ApiError(404, "TRASH_RECORD_NOT_FOUND", "The deleted record no longer exists.");
            const auto label = rows[0]["label"].as<std::string>();
                tx.db->execSqlSync("INSERT INTO admin_audit_log(actor,action,entity_type,entity_id,entity_label) VALUES($1,'restore',$2,$3,$4)", actor.username, type, id, label);
            tx.commit();
            Json::Value result; result["restored_id"] = std::to_string(id); result["entity_type"] = type; return result;
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/people", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            if (request->method() == drogon::Post) {
                const auto body = bodyOf(request);
                if (actor.role == "admin") return submitAdminChange(actor, "person.create", 0, body);
                const auto result = personWriter_.save(0, personOf(body, false));
                logEvent("person_created"); return toJson(result);
            }
            Page page;
            const auto& params = request->getParameters();
            if (params.contains("page")) page.number = positiveInteger(params.at("page"), 1000000, "page");
            if (params.contains("pageSize")) page.size = positiveInteger(params.at("pageSize"), 100, "pageSize");
            const auto result = personWriter_.list(page);
            Json::Value json;
            json["data"] = jsonArray(result.data);
            json["pagination"]["page"] = page.number;
            json["pagination"]["pageSize"] = page.size;
            json["pagination"]["total"] = Json::Int64(result.total);
            return json;
        }, request->method() == drogon::Post ? 201 : 200);
    }, {drogon::Get, drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/people/{1}", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
        dispatch(std::move(callback), [this, request, id = std::move(id)] {
            const auto actorPrincipal = auth_.requirePrincipal(request->getHeader("authorization"));
            const auto actor = actorPrincipal.username;
            if (request->method() == drogon::Get) return toJson(personWriter_.get(idOf(id)));
            if (request->method() == drogon::Delete) {
                const auto body = bodyOf(request); fieldsOf(body, {"revision"});
                const auto personId = idOf(id);
                if (actorPrincipal.role == "admin") return submitAdminChange(actorPrincipal, "person.delete", personId, body);
                personWriter_.remove(personId, revisionOf(body), actor);
                logEvent("person_deleted");
                Json::Value result; result["deleted_id"] = std::to_string(personId); return result;
            }
            const auto body = bodyOf(request);
            if (actorPrincipal.role == "admin") return submitAdminChange(actorPrincipal, "person.update", idOf(id), body);
            const auto result = personWriter_.save(idOf(id), personOf(body, true));
            logEvent("person_updated"); return toJson(result);
        });
    }, {drogon::Get, drogon::Put, drogon::Delete});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/credits", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
        dispatch(std::move(callback), [this, request, id = std::move(id)] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            if (request->method() == drogon::Get) return toJson(personWriter_.getCredits(idOf(id)));
            const auto body = bodyOf(request);
            if (actor.role == "admin") return submitAdminChange(actor, "credits.update", idOf(id), body);
            const auto result = personWriter_.saveCredits(idOf(id), creditsOf(body));
            logEvent("midi_credits_updated"); return toJson(result);
        });
    }, {drogon::Get, drogon::Put});
    drogon::app().registerHandler("/api/v1/admin/login", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto body = bodyOf(request);
            const auto username = stringOf(body, "username", 100);
            const auto token = auth_.login(username, stringOf(body, "password", 1024));
            Json::Value result;
            result["token"] = token; result["username"] = username; result["expires_in"] = 28800;
            logEvent("admin_login");
            return result;
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/session", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto principal = auth_.requirePrincipal(request->getHeader("authorization"));
            Json::Value result;
            result["username"] = principal.username;
            result["role"] = principal.role;
            result["user_id"] = principal.userId.empty() ? Json::Value(Json::nullValue) : Json::Value(principal.userId);
            result["midi_import_enabled"] = importer_.enabled();
            return result;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/users", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto actor = auth_.requireSuperAdmin(request->getHeader("authorization"));
            if (request->method() == drogon::Get) {
                Json::Value result(Json::arrayValue);
                for (const auto& row : db_->execSqlSync(
                    "SELECT id::text,username,role,status,created_by,created_at FROM admin_users ORDER BY created_at,id")) {
                    Json::Value item;
                    item["id"] = row["id"].as<std::string>(); item["username"] = row["username"].as<std::string>();
                    item["role"] = row["role"].as<std::string>(); item["status"] = row["status"].as<std::string>();
                    item["created_by"] = nullable<std::string>(row["created_by"]).value_or("");
                    item["created_at"] = row["created_at"].as<std::string>(); result.append(item);
                }
                return result;
            }
            const auto body = bodyOf(request); fieldsOf(body, {"username", "role"});
            const auto username = stringOf(body, "username", 64);
            const auto role = stringOf(body, "role", 20);
            if (!std::regex_match(username, std::regex("^[A-Za-z0-9_.-]{3,64}$")) ||
                (role != "admin" && role != "super_admin"))
                throw ApiError(400, "INVALID_INPUT", "A valid username and role are required.");
            const auto token = auth::randomToken();
            const auto tokenHash = auth::digest(token);
            TransactionScope tx(db_);
            const auto created = tx.db->execSqlSync(
                "INSERT INTO admin_users(username,role,status,invitation_hash,invitation_expires_at,created_by) "
                "VALUES($1,$2,'invited',$3,CURRENT_TIMESTAMP+INTERVAL '48 hours',$4) "
                "ON CONFLICT(username) DO UPDATE SET role=EXCLUDED.role,status='invited',invitation_hash=EXCLUDED.invitation_hash, "
                "invitation_expires_at=EXCLUDED.invitation_expires_at,created_by=EXCLUDED.created_by "
                "WHERE admin_users.status='disabled' AND admin_users.password_hash IS NULL "
                "RETURNING id::text,invitation_expires_at",
                username, role, tokenHash, actor.username);
            if (created.empty()) throw ApiError(409, "USER_EXISTS", "That username is already in use.");
            const auto userId = created[0]["id"].as<std::string>();
            tx.db->execSqlSync("DELETE FROM admin_invitations WHERE user_id=$1::uuid", userId);
            tx.db->execSqlSync("INSERT INTO admin_invitations(token_hash,user_id,created_by,expires_at) "
                "SELECT $1,$2::uuid,$3,invitation_expires_at FROM admin_users WHERE id=$2::uuid",
                tokenHash, userId, actor.username);
            Json::Value detail; detail["username"] = username; detail["role"] = role;
            tx.db->execSqlSync("INSERT INTO admin_user_audit(actor,target_user,action,detail) VALUES($1,$2::uuid,'invite',$3::jsonb)",
                actor.username, userId, detail.toStyledString());
            tx.commit();
            Json::Value result; result["id"] = userId; result["username"] = username;
            result["role"] = role; result["status"] = "invited"; result["invitation_token"] = token;
            result["expires_at"] = created[0]["invitation_expires_at"].as<std::string>();
            return result;
        }, request->method() == drogon::Post ? 201 : 200);
    }, {drogon::Get, drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/users/{1}", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string userId) {
        dispatch(std::move(callback), [this, request, userId = std::move(userId)] {
            const auto actor = auth_.requireSuperAdmin(request->getHeader("authorization"));
            if (!std::regex_match(userId, std::regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")))
                throw ApiError(400, "INVALID_INPUT", "A valid user id is required.");
            const auto body = bodyOf(request); fieldsOf(body, {"role", "status"});
            const auto role = stringOf(body, "role", 20); const auto status = stringOf(body, "status", 20);
            if ((role != "admin" && role != "super_admin") || (status != "invited" && status != "active" && status != "disabled"))
                throw ApiError(400, "INVALID_INPUT", "A valid role and status are required.");
            TransactionScope tx(db_);
            tx.db->execSqlSync("SELECT pg_advisory_xact_lock(741032, 2)");
            const auto current = tx.db->execSqlSync("SELECT username,role,status,password_hash FROM admin_users WHERE id=$1::uuid FOR UPDATE", userId);
            if (current.empty()) throw ApiError(404, "USER_NOT_FOUND", "Administrator account does not exist.");
            const auto username = current[0]["username"].as<std::string>();
            const auto oldRole = current[0]["role"].as<std::string>(); const auto oldStatus = current[0]["status"].as<std::string>();
            if (status == "active" && current[0]["password_hash"].isNull())
                throw ApiError(409, "INVITATION_REQUIRED", "An invited account must accept a fresh invitation before activation.");
            if (actor.userId == userId && (role != "super_admin" || status != "active"))
                throw ApiError(400, "CANNOT_DISABLE_SELF", "You cannot remove your own super administrator access.");
            if (oldRole == "super_admin" && oldStatus == "active" && (role != "super_admin" || status != "active")) {
                const auto count = tx.db->execSqlSync("SELECT count(*) AS n FROM admin_users WHERE role='super_admin' AND status='active'")[0]["n"].as<std::int64_t>();
                if (count <= 1 && !auth_.hasEnvironmentCredentials())
                    throw ApiError(409, "LAST_SUPER_ADMIN", "At least one active super administrator must remain.");
            }
            if (status == "invited") throw ApiError(400, "INVALID_INPUT", "Use the invitation flow to create an invited account.");
            tx.db->execSqlSync("UPDATE admin_users SET role=$2,status=$3,invitation_hash=NULL,invitation_expires_at=NULL "
                "WHERE id=$1::uuid", userId, role, status);
            tx.db->execSqlSync("DELETE FROM admin_invitations WHERE user_id=$1::uuid", userId);
            Json::Value detail; detail["username"] = username; detail["role"] = role; detail["status"] = status;
            const auto action = status == "disabled" ? "disabled" : "role_changed";
            tx.db->execSqlSync("INSERT INTO admin_user_audit(actor,target_user,action,detail) VALUES($1,$2::uuid,$3,$4::jsonb)",
                actor.username, userId, action, detail.toStyledString());
            tx.commit();
            Json::Value result; result["id"] = userId; result["username"] = username; result["role"] = role; result["status"] = status; return result;
        });
    }, {drogon::Put});
    drogon::app().registerHandler("/api/v1/admin/invitations/accept", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto body = bodyOf(request); fieldsOf(body, {"token", "password"});
            const auto token = stringOf(body, "token", 64); const auto password = stringOf(body, "password", 1024);
            if (!std::regex_match(token, std::regex("^[0-9a-f]{64}$")) || password.size() < 12)
                throw ApiError(400, "INVALID_INPUT", "The invitation token or password is invalid.");
            const auto tokenHash = auth::digest(token);
            const auto exists = db_->execSqlSync("SELECT user_id FROM admin_invitations WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP", tokenHash);
            if (exists.empty()) throw ApiError(400, "INVITATION_INVALID", "The invitation is invalid or expired.");
            const auto passwordHash = auth::hashPassword(password);
            TransactionScope tx(db_);
            const auto accepted = tx.db->execSqlSync(
                "UPDATE admin_users SET password_hash=$2,status='active',invitation_hash=NULL,invitation_expires_at=NULL "
                "WHERE id=$1::uuid AND status='invited' AND invitation_hash=$3 AND invitation_expires_at>CURRENT_TIMESTAMP RETURNING id::text,username",
                exists[0]["user_id"].as<std::string>(), passwordHash, tokenHash);
            if (accepted.empty()) throw ApiError(400, "INVITATION_INVALID", "The invitation is invalid or expired.");
            tx.db->execSqlSync("DELETE FROM admin_invitations WHERE token_hash=$1", tokenHash);
            tx.db->execSqlSync("INSERT INTO admin_user_audit(actor,target_user,action,detail) VALUES($1,$2::uuid,'accept_invite','{}'::jsonb)",
                accepted[0]["username"].as<std::string>(), accepted[0]["id"].as<std::string>());
            tx.commit();
            Json::Value result; result["username"] = accepted[0]["username"].as<std::string>(); result["status"] = "active"; return result;
        }, 200);
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/logout", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            auth_.logout(request->getHeader("authorization"));
            Json::Value result; result["status"] = "ok";
            logEvent("admin_logout"); return result;
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        // Reserve before queueing because JSON creation can carry a full MIDI file.
        if (importsPending_.fetch_add(1) >= 2) {
            --importsPending_;
            Json::Value json; json["error"]["code"] = "SERVER_BUSY"; json["error"]["message"] = "Please retry shortly.";
            auto response = drogon::HttpResponse::newHttpJsonResponse(json);
            response->setStatusCode(drogon::k503ServiceUnavailable);
            response->addHeader("Cache-Control", "no-store"); callback(response); return;
        }
        auto slot = std::shared_ptr<int>(new int(0), [this](int* p) { delete p; --importsPending_; });
        dispatch(std::move(callback), [this, request, slot] {
            const auto actor = requireFilePrincipal(request);
            auto body = bodyOf(request);
            const bool hasFile = body.isMember("file");
            if (hasFile && !body.isMember("request_id"))
                throw ApiError(400, "INVALID_INPUT", "A file requires request_id for safe retries.");
            if (!body.isMember("request_id")) {
                if (actor.role == "admin") {
                    if (body.isMember("file"))
                        throw ApiError(400, "INVALID_INPUT", "A request_id is required when proposing a MIDI file.");
                    return submitAdminChange(actor, "midi.create", 0, body);
                }
                const auto entry = writer_.create(entryOf(body, false));
                logEvent("midi_created"); return toJson(entry);
            }
            if (actor.role == "admin") {
                if (hasFile) {
                    if (!importer_.enabled()) throw ApiError(503, "IMPORT_DISABLED", "File import is disabled.");
                    const auto& file = body["file"];
                    fieldsOf(file, {"filename", "content_base64", "rights_confirmed"});
                    if (!file["rights_confirmed"].isBool() || !file["rights_confirmed"].asBool())
                        throw ApiError(400, "RIGHTS_CONFIRMATION_REQUIRED", "Confirm the right to publicly distribute this file.");
                    midi::validateFilename(stringOf(file, "filename", 255));
                    if (!file["content_base64"].isString()) throw ApiError(400, "INVALID_FILE", "File content is required.");
                    midi::validateFileContent(midi::decodeMidiContentBase64(file["content_base64"].asString()));
                }
                return submitAdminChange(actor, "midi.create", 0, body);
            }
            const auto requestId = stringOf(body, "request_id", 36);
            body.removeMember("request_id");
            std::optional<midi::MidiCreationFile> upload;
            if (hasFile) {
                const auto& file = body["file"];
                fieldsOf(file, {"filename", "content_base64", "rights_confirmed"});
                if (!file["filename"].isString() || !file["content_base64"].isString() || !file["rights_confirmed"].isBool())
                    throw ApiError(400, "INVALID_INPUT", "A file requires filename, content_base64 and boolean rights_confirmed.");
                upload.emplace();
                upload->filename = file["filename"].asString();
                upload->rightsConfirmed = file["rights_confirmed"].asBool();
                upload->bytes = midi::decodeMidiContentBase64(file["content_base64"].asString());
                body.removeMember("file");
            }
            if (actor.role != "super_admin") throw ApiError(403, "SUPER_ADMIN_REQUIRED", "File import requires a super administrator.");
            const auto entry = importer_.create(entryOf(body, false), requestId, upload);
            logEvent("midi_created"); return toJson(entry);
        }, 201);
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
        dispatch(std::move(callback), [this, request, id = std::move(id)] {
            const auto actorPrincipal = auth_.requirePrincipal(request->getHeader("authorization"));
            if (request->method() == drogon::Get) return toJson(writer_.get(idOf(id)));
            if (request->method() == drogon::Delete) {
                const auto body = bodyOf(request); fieldsOf(body, {"revision"});
                const auto midiId = idOf(id);
                if (actorPrincipal.role == "admin") return submitAdminChange(actorPrincipal, "midi.delete", midiId, body);
                writer_.remove(midiId, revisionOf(body), actorPrincipal.username);
                logEvent("midi_deleted");
                Json::Value result; result["deleted_id"] = std::to_string(midiId); return result;
            }
            const auto body = bodyOf(request);
            if (actorPrincipal.role == "admin") return submitAdminChange(actorPrincipal, "midi.update", idOf(id), body);
            const auto entry = writer_.update(idOf(id), entryOf(body, true));
            logEvent("midi_updated"); return toJson(entry);
        });
    }, {drogon::Get, drogon::Put, drogon::Delete});
}
}
