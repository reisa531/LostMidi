#include "common/ApiController.h"
#include "common/Json.h"
#include <regex>

namespace lostmidi {
namespace {
Json::Value changePage(const drogon::orm::DbClientPtr& db, const drogon::HttpRequestPtr& request,
                       const auth::SessionPrincipal& actor, bool ownOnly) {
    const auto& params = request->getParameters();
    const auto page = params.contains("page") ? positiveInteger(params.at("page"), 1000000, "page") : 1;
    const auto pageSize = params.contains("pageSize") ? positiveInteger(params.at("pageSize"), 50, "pageSize") : 20;
    const auto status = params.contains("status") ? params.at("status") : std::string(ownOnly ? "all" : "pending");
    if (status != "all" && status != "pending" && status != "reviewing" && status != "failed" && status != "approved" && status != "rejected" && status != "stale")
        throw ApiError(400, "INVALID_INPUT", "Unknown review status.");
    const auto totalRows = ownOnly
        ? (status == "all"
            ? db->execSqlSync("SELECT count(*) AS total FROM admin_change_requests WHERE proposed_by=$1", actor.username)
            : db->execSqlSync("SELECT count(*) AS total FROM admin_change_requests WHERE proposed_by=$1 AND status=$2", actor.username, status))
        : (status == "all"
            ? db->execSqlSync("SELECT count(*) AS total FROM admin_change_requests")
            : db->execSqlSync("SELECT count(*) AS total FROM admin_change_requests WHERE status=$1", status));
    const auto rows = ownOnly
        ? (status == "all"
            ? db->execSqlSync("SELECT id::text,request_type,entity_id,proposed_by,((payload - 'content_base64') #- '{file,content_base64}')::text AS payload,status,review_note,created_at FROM admin_change_requests WHERE proposed_by=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3", actor.username, pageSize, (page - 1) * pageSize)
            : db->execSqlSync("SELECT id::text,request_type,entity_id,proposed_by,((payload - 'content_base64') #- '{file,content_base64}')::text AS payload,status,review_note,created_at FROM admin_change_requests WHERE proposed_by=$1 AND status=$2 ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4", actor.username, status, pageSize, (page - 1) * pageSize))
        : (status == "all"
            ? db->execSqlSync("SELECT id::text,request_type,entity_id,proposed_by,((payload - 'content_base64') #- '{file,content_base64}')::text AS payload,status,review_note,created_at FROM admin_change_requests ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2", pageSize, (page - 1) * pageSize)
            : db->execSqlSync("SELECT id::text,request_type,entity_id,proposed_by,((payload - 'content_base64') #- '{file,content_base64}')::text AS payload,status,review_note,created_at FROM admin_change_requests WHERE status=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3", status, pageSize, (page - 1) * pageSize));
    Json::Value result; result["data"] = Json::Value(Json::arrayValue);
    result["pagination"]["page"] = page; result["pagination"]["pageSize"] = pageSize;
    result["pagination"]["total"] = Json::Int64(totalRows[0]["total"].as<std::int64_t>());
    for (const auto& row : rows) {
        Json::Value item; item["id"] = row["id"].as<std::string>(); item["type"] = row["request_type"].as<std::string>();
        item["entity_id"] = nullable<std::int64_t>(row["entity_id"]) ? Json::Value(Json::Int64(*nullable<std::int64_t>(row["entity_id"]))) : Json::Value(Json::nullValue);
        item["proposed_by"] = row["proposed_by"].as<std::string>(); item["payload"] = row["payload"].as<std::string>();
        item["status"] = row["status"].as<std::string>(); item["review_note"] = nullable<std::string>(row["review_note"]).value_or("");
        item["created_at"] = row["created_at"].as<std::string>(); result["data"].append(item);
    }
    return result;
}
}
void ApiController::registerAdminReviewQueueRoutes() {
    drogon::app().registerHandler("/api/v1/admin/changes", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto actor = auth_.requireSuperAdmin(request->getHeader("authorization"));
            return changePage(db_, request, actor, false);
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/submissions", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            return changePage(db_, request, actor, true);
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/changes/{1}/close", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string requestId) {
        dispatch(std::move(callback), [this, request, requestId = std::move(requestId)] {
            const auto actor = auth_.requireSuperAdmin(request->getHeader("authorization"));
            if (!std::regex_match(requestId, std::regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")))
                throw ApiError(400, "INVALID_INPUT", "A valid request id is required.");
            const auto body = request->getJsonObject();
            if (!body || !body->isObject() || body->size() != 1 || !(*body)["note"].isString() || (*body)["note"].asString().size() > 2000)
                throw ApiError(400, "INVALID_INPUT", "A valid reason is required.");
            const auto note = (*body)["note"].asString();
            if (note.empty()) throw ApiError(400, "INVALID_INPUT", "A reason is required.");
            const auto rows = db_->execSqlSync("UPDATE admin_change_requests SET status='rejected',review_note=$2,reviewed_by=$3,reviewed_at=CURRENT_TIMESTAMP WHERE id=$1::uuid AND status='failed' RETURNING id", requestId, note, actor.username);
            if (rows.empty()) throw ApiError(409, "REQUEST_NOT_FAILED", "Only failed requests can be closed.");
            Json::Value result; result["closed_id"] = requestId; return result;
        });
    }, {drogon::Post});
}
}  // namespace lostmidi
