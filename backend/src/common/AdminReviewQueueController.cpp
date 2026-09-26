#include "common/ApiController.h"
#include "common/Json.h"
#include <regex>

namespace lostmidi {
void ApiController::registerAdminReviewQueueRoutes() {
    drogon::app().registerHandler("/api/v1/admin/changes", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            const auto& params = request->getParameters();
            const auto page = params.contains("page") ? positiveInteger(params.at("page"), 1000000, "page") : 1;
            const auto pageSize = params.contains("pageSize") ? positiveInteger(params.at("pageSize"), 50, "pageSize") : 20;
            const auto status = params.contains("status") ? params.at("status") : std::string(actor.role == "super_admin" ? "pending" : "all");
            if (status != "all" && status != "pending" && status != "reviewing" && status != "failed" && status != "approved" && status != "rejected" && status != "stale")
                throw ApiError(400, "INVALID_INPUT", "Unknown review status.");
            const auto totalRows = db_->execSqlSync("SELECT count(*) AS total FROM admin_change_requests WHERE ($1='all' OR status=$1) AND ($2='super_admin' OR proposed_by=$3)", status, actor.role, actor.username);
            const auto rows = db_->execSqlSync("SELECT id::text,request_type,entity_id,proposed_by,((payload - 'content_base64') #- '{file,content_base64}')::text AS payload,status,review_note,created_at FROM admin_change_requests WHERE ($1='all' OR status=$1) AND ($2='super_admin' OR proposed_by=$3) ORDER BY created_at DESC,id DESC LIMIT $4 OFFSET $5", status, actor.role, actor.username, pageSize, (page - 1) * pageSize);
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
