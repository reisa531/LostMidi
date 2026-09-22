#include "common/ApiController.h"
#include "common/Json.h"
#include "common/Log.h"
#include <algorithm>
#include <charconv>
#include <set>

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
recovery::HistoricalSource sourceOf(const Json::Value& json) {
    fieldsOf(json, {"revision", "website_name", "original_url", "first_seen_at", "last_seen_at", "wayback_url", "notes"});
    recovery::HistoricalSource source;
    source.websiteName = stringOf(json, "website_name");
    source.originalUrl = optionalText(json, "original_url");
    source.firstSeenAt = optionalText(json, "first_seen_at");
    source.lastSeenAt = optionalText(json, "last_seen_at");
    source.waybackUrl = optionalText(json, "wayback_url");
    source.notes = optionalText(json, "notes");
    return source;
}
recovery::RecoveryEvent eventOf(const Json::Value& json) {
    fieldsOf(json, {"revision", "recovered_at", "recovered_by", "story", "evidence"});
    recovery::RecoveryEvent event;
    event.recoveredAt = optionalText(json, "recovered_at");
    if (!json["recovered_by"].isNull()) event.recoveredBy = idOf(stringOf(json, "recovered_by"));
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
                auth_.require(request->getHeader("authorization"));
                const auto body = bodyOf(request);
                const auto result = recoveryWriter_.saveSource(idOf(id), 0, revisionOf(body), sourceOf(body));
                logEvent("historical_source_created");
                return toJson(result);
            }, 201);
        }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/sources/{2}",
        [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id, std::string sourceId) {
            dispatch(std::move(callback), [this, request, id = std::move(id), sourceId = std::move(sourceId)] {
                auth_.require(request->getHeader("authorization"));
                const auto body = bodyOf(request);
                if (request->method() == drogon::Delete) {
                    fieldsOf(body, {"revision"});
                    const auto result = recoveryWriter_.deleteSource(idOf(id), idOf(sourceId), revisionOf(body));
                    logEvent("historical_source_deleted");
                    return toJson(result);
                }
                const auto result = recoveryWriter_.saveSource(idOf(id), idOf(sourceId), revisionOf(body), sourceOf(body));
                logEvent("historical_source_updated");
                return toJson(result);
            });
        }, {drogon::Put, drogon::Delete});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/recovery-events",
        [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
            dispatch(std::move(callback), [this, request, id = std::move(id)] {
                auth_.require(request->getHeader("authorization"));
                const auto body = bodyOf(request);
                const auto result = recoveryWriter_.saveEvent(idOf(id), 0, revisionOf(body), eventOf(body));
                logEvent("recovery_event_created");
                return toJson(result);
            }, 201);
        }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/recovery-events/{2}",
        [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id, std::string eventId) {
            dispatch(std::move(callback), [this, request, id = std::move(id), eventId = std::move(eventId)] {
                auth_.require(request->getHeader("authorization"));
                const auto body = bodyOf(request);
                if (request->method() == drogon::Delete) {
                    fieldsOf(body, {"revision"});
                    const auto result = recoveryWriter_.deleteEvent(idOf(id), idOf(eventId), revisionOf(body));
                    logEvent("recovery_event_deleted");
                    return toJson(result);
                }
                const auto result = recoveryWriter_.saveEvent(idOf(id), idOf(eventId), revisionOf(body), eventOf(body));
                logEvent("recovery_event_updated");
                return toJson(result);
            });
        }, {drogon::Put, drogon::Delete});
}
}  // namespace lostmidi
