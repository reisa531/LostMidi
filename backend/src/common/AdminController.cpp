#include "common/ApiController.h"
#include "common/Json.h"
#include "common/Log.h"
#include "common/Transaction.h"
#include "auth/Password.h"
#include <set>
#include <regex>

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
Json::Value proposeChange(const drogon::orm::DbClientPtr& db, const auth::SessionPrincipal& actor,
                          const std::string& type, std::int64_t entityId, const Json::Value& payload) {
    const auto rows = db->execSqlSync(
        "INSERT INTO admin_change_requests(request_type,entity_id,proposed_by,payload) VALUES($1,$2,$3,$4::jsonb) RETURNING id::text,created_at",
        type, entityId > 0 ? std::optional<std::int64_t>(entityId) : std::nullopt, actor.username, payload.toStyledString());
    Json::Value result;
    result["request_id"] = rows[0]["id"].as<std::string>();
    result["status"] = "pending";
    result["created_at"] = rows[0]["created_at"].as<std::string>();
    result["message"] = "Submitted for super administrator review.";
    return result;
}
person::PersonEdit personOf(const Json::Value& json, bool editing) {
    fieldsOf(json, {"display_name", "biography", "aliases", "revision"});
    person::PersonEdit edit;
    edit.person.displayName = stringOf(json, "display_name", 300);
    if (!json["biography"].isNull()) edit.person.biography = stringOf(json, "biography", 20000);
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
midi::MidiEntry entryOf(const Json::Value& json, bool editing) {
    const std::set<std::string> allowed{"title","slug","description","estimated_year","archive_status","copyright_status","license","rights_holder","distribution_permission","revision"};
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
                ? db_->execSqlSync("SELECT id::text,request_type,entity_id,proposed_by,payload,status,review_note,created_at FROM admin_change_requests WHERE status IN ('pending','reviewing','failed') ORDER BY created_at,id LIMIT 200")
                : db_->execSqlSync("SELECT id::text,request_type,entity_id,proposed_by,payload,status,review_note,created_at FROM admin_change_requests WHERE proposed_by=$1 ORDER BY created_at DESC,id DESC LIMIT 100", actor.username);
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
                    if (type == "midi.create") applied = toJson(writer_.create(entryOf(payload, false)));
                    else if (type == "midi.update") applied = toJson(writer_.update(entity, entryOf(payload, true)));
                    else if (type == "person.create") applied = toJson(personWriter_.save(0, personOf(payload, false)));
                    else if (type == "person.update") applied = toJson(personWriter_.save(entity, personOf(payload, true)));
                    else if (type == "credits.update") applied = toJson(personWriter_.saveCredits(entity, creditsOf(payload)));
                    else throw ApiError(422, "REVIEW_TYPE_UNSUPPORTED", "This request type cannot be approved through the review panel.");
                    db_->execSqlSync("UPDATE admin_change_requests SET status='approved',review_note=$2,reviewed_by=$3,reviewed_at=CURRENT_TIMESTAMP,result=$4::jsonb WHERE id=$1::uuid", requestId, note, reviewer.username, applied.toStyledString());
                } catch (const ApiError& error) {
                    const auto status = error.code == "STALE_ENTRY" ? "stale" : "failed";
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
            const auto actor = auth_.requireSuperAdmin(request->getHeader("authorization")).username;
            if (type != "midi" && type != "person") throw ApiError(400, "INVALID_INPUT", "Unknown trash record type.");
            const auto id = idOf(value);
            TransactionScope tx(db_);
            const auto rows = type == "midi"
                ? tx.db->execSqlSync("UPDATE midi_entries SET deleted_at=NULL,deleted_by=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING title AS label", id)
                : tx.db->execSqlSync("UPDATE people SET deleted_at=NULL,deleted_by=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING display_name AS label", id);
            if (rows.empty()) throw ApiError(404, "TRASH_RECORD_NOT_FOUND", "The deleted record no longer exists.");
            const auto label = rows[0]["label"].as<std::string>();
                tx.db->execSqlSync("INSERT INTO admin_audit_log(actor,action,entity_type,entity_id,entity_label) VALUES($1,'restore',$2,$3,$4)", actor, type, id, label);
            tx.commit();
            Json::Value result; result["restored_id"] = std::to_string(id); result["entity_type"] = type; return result;
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/people", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            if (request->method() == drogon::Post) {
                const auto body = bodyOf(request);
                if (actor.role == "admin") return proposeChange(db_, actor, "person.create", 0, body);
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
                if (actorPrincipal.role != "super_admin") throw ApiError(403, "SUPER_ADMIN_REQUIRED", "Deletion requires a super administrator.");
                const auto body = bodyOf(request); fieldsOf(body, {"revision"});
                const auto personId = idOf(id);
                personWriter_.remove(personId, revisionOf(body), actor);
                logEvent("person_deleted");
                Json::Value result; result["deleted_id"] = std::to_string(personId); return result;
            }
            const auto body = bodyOf(request);
            if (actorPrincipal.role == "admin") return proposeChange(db_, actorPrincipal, "person.update", idOf(id), body);
            const auto result = personWriter_.save(idOf(id), personOf(body, true));
            logEvent("person_updated"); return toJson(result);
        });
    }, {drogon::Get, drogon::Put, drogon::Delete});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/credits", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
        dispatch(std::move(callback), [this, request, id = std::move(id)] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            if (request->method() == drogon::Get) return toJson(personWriter_.getCredits(idOf(id)));
            const auto body = bodyOf(request);
            if (actor.role == "admin") return proposeChange(db_, actor, "credits.update", idOf(id), body);
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
                if (count <= 1) throw ApiError(409, "LAST_SUPER_ADMIN", "At least one active super administrator must remain.");
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
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            auto body = bodyOf(request);
            const bool hasFile = body.isMember("file");
            if (hasFile && !body.isMember("request_id"))
                throw ApiError(400, "INVALID_INPUT", "A file requires request_id for safe retries.");
            if (!body.isMember("request_id")) {
                if (actor.role == "admin") {
                    if (body.isMember("file")) throw ApiError(403, "SUPER_ADMIN_REQUIRED", "File import requires a super administrator.");
                    body.removeMember("request_id");
                    return proposeChange(db_, actor, "midi.create", 0, body);
                }
                const auto entry = writer_.create(entryOf(body, false));
                logEvent("midi_created"); return toJson(entry);
            }
            if (actor.role == "admin") {
                if (hasFile) throw ApiError(403, "SUPER_ADMIN_REQUIRED", "File import requires a super administrator.");
                body.removeMember("request_id");
                return proposeChange(db_, actor, "midi.create", 0, body);
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
                if (actorPrincipal.role != "super_admin") throw ApiError(403, "SUPER_ADMIN_REQUIRED", "Deletion requires a super administrator.");
                const auto body = bodyOf(request); fieldsOf(body, {"revision"});
                const auto midiId = idOf(id);
                writer_.remove(midiId, revisionOf(body), actorPrincipal.username);
                logEvent("midi_deleted");
                Json::Value result; result["deleted_id"] = std::to_string(midiId); return result;
            }
            const auto body = bodyOf(request);
            if (actorPrincipal.role == "admin") return proposeChange(db_, actorPrincipal, "midi.update", idOf(id), body);
            const auto entry = writer_.update(idOf(id), entryOf(body, true));
            logEvent("midi_updated"); return toJson(entry);
        });
    }, {drogon::Get, drogon::Put, drogon::Delete});
}
}
