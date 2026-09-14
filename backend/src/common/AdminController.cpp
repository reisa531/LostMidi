#include "common/ApiController.h"
#include "common/Json.h"
#include "common/Log.h"
#include <set>

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
            Json::Value result;
            result["username"] = auth_.require(request->getHeader("authorization"));
            return result;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/logout", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            auth_.logout(request->getHeader("authorization"));
            Json::Value result; result["status"] = "ok";
            logEvent("admin_logout"); return result;
        });
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            auth_.require(request->getHeader("authorization"));
            const auto entry = writer_.create(entryOf(bodyOf(request), false));
            logEvent("midi_created"); return toJson(entry);
        }, 201);
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
        dispatch(std::move(callback), [this, request, id = std::move(id)] {
            auth_.require(request->getHeader("authorization"));
            if (request->method() == drogon::Get) return toJson(writer_.get(idOf(id)));
            const auto entry = writer_.update(idOf(id), entryOf(bodyOf(request), true));
            logEvent("midi_updated"); return toJson(entry);
        });
    }, {drogon::Get, drogon::Put});
}
}
