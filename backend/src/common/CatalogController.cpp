#include "common/ApiController.h"
#include "catalog/Json.h"
#include "common/Error.h"
#include <charconv>
#include <regex>

namespace lostmidi {
void ApiController::registerCatalogRoutes() {
    const auto linksJson = [this] {
        Json::Value result(Json::arrayValue);
        for (const auto& row : db_->execSqlSync("SELECT id,title,url,description,sort_order FROM useful_links ORDER BY sort_order,id")) {
            Json::Value item;
            item["id"] = std::to_string(row["id"].as<std::int64_t>());
            item["title"] = row["title"].as<std::string>();
            item["url"] = row["url"].as<std::string>();
            item["description"] = row["description"].as<std::string>();
            item["sort_order"] = row["sort_order"].as<int>();
            result.append(item);
        }
        return result;
    };
    drogon::app().registerHandler("/api/v1/useful-links", [this, linksJson](const drogon::HttpRequestPtr&, Callback&& callback) {
        dispatch(std::move(callback), linksJson);
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/useful-links", [this, linksJson](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request, linksJson] {
            auth_.require(request->getHeader("authorization"));
            if (request->method() == drogon::Get) return linksJson();
            const auto body = request->getJsonObject();
            if (!body || !body->isObject() || !(*body)["title"].isString() || !(*body)["url"].isString() || !(*body)["description"].isString() || !(*body)["sort_order"].isInt())
                throw ApiError(400, "INVALID_INPUT", "Valid link fields are required.");
            const auto title = (*body)["title"].asString(), url = (*body)["url"].asString(), description = (*body)["description"].asString();
            static const std::regex safeUrl(R"(^https?://[^/@\s?#:]+(:[0-9]{1,5})?([/?#][^\s]*)?$)");
            if (title.empty() || title.size() > 120 || description.size() > 500 || url.size() > 4096 || !std::regex_match(url, safeUrl))
                throw ApiError(400, "INVALID_INPUT", "Invalid title, description or HTTP URL.");
            db_->execSqlSync("INSERT INTO useful_links(title,url,description,sort_order) VALUES($1,$2,$3,$4)", title, url, description, (*body)["sort_order"].asInt());
            return linksJson();
        });
    }, {drogon::Get, drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/useful-links/{1}", [this, linksJson](const drogon::HttpRequestPtr& request, Callback&& callback, std::string value) {
        dispatch(std::move(callback), [this, request, value = std::move(value), linksJson] {
            auth_.require(request->getHeader("authorization"));
            std::int64_t id = 0;
            const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), id);
            if (error != std::errc{} || end != value.data() + value.size() || id < 1) throw ApiError(400, "INVALID_INPUT", "Invalid link id.");
            if (request->method() == drogon::Delete) {
                if (db_->execSqlSync("DELETE FROM useful_links WHERE id=$1 RETURNING id", id).empty()) throw ApiError(404, "LINK_NOT_FOUND", "Link not found.");
            } else {
                const auto body = request->getJsonObject();
                if (!body || !body->isObject() || !(*body)["title"].isString() || !(*body)["url"].isString() || !(*body)["description"].isString() || !(*body)["sort_order"].isInt())
                    throw ApiError(400, "INVALID_INPUT", "Valid link fields are required.");
                const auto title = (*body)["title"].asString(), url = (*body)["url"].asString(), description = (*body)["description"].asString();
                static const std::regex safeUrl(R"(^https?://[^/@\s?#:]+(:[0-9]{1,5})?([/?#][^\s]*)?$)");
                if (title.empty() || title.size() > 120 || description.size() > 500 || url.size() > 4096 || !std::regex_match(url, safeUrl))
                    throw ApiError(400, "INVALID_INPUT", "Invalid title, description or HTTP URL.");
                if (db_->execSqlSync("UPDATE useful_links SET title=$2,url=$3,description=$4,sort_order=$5 WHERE id=$1 RETURNING id", id, title, url, description, (*body)["sort_order"].asInt()).empty())
                    throw ApiError(404, "LINK_NOT_FOUND", "Link not found.");
            }
            return linksJson();
        });
    }, {drogon::Put, drogon::Delete});
    // Public summaries also power the admin dashboard; never consult auth/session
    // state here. All validation and SQL stay on the existing bounded worker queue.
    drogon::app().registerHandler("/api/v1/catalog/overview", [this](const drogon::HttpRequestPtr&, Callback&& callback) {
        dispatch(std::move(callback), [this] { return catalog::toJson(catalog_.overview()); });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/catalog/entries", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto& parameters = request->getParameters();
            return catalog::toJson(catalog_.entries(catalog::parseEntryQuery({parameters.begin(), parameters.end()})));
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/people", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto& parameters = request->getParameters();
            return catalog::toJson(catalog_.people(catalog::parsePeopleQuery({parameters.begin(), parameters.end()})));
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/catalog/groups", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto& parameters = request->getParameters();
            return catalog::toJson(catalog_.groups(catalog::parseGroupQuery({parameters.begin(), parameters.end()})));
        });
    }, {drogon::Get});
}
}  // namespace lostmidi
