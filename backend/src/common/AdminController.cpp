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
    drogon::app().registerHandler("/api/v1/admin/people", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            auth_.require(request->getHeader("authorization"));
            if (request->method() == drogon::Post) {
                const auto result = personWriter_.save(0, personOf(bodyOf(request), false));
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
            auth_.require(request->getHeader("authorization"));
            if (request->method() == drogon::Get) return toJson(personWriter_.get(idOf(id)));
            const auto result = personWriter_.save(idOf(id), personOf(bodyOf(request), true));
            logEvent("person_updated"); return toJson(result);
        });
    }, {drogon::Get, drogon::Put});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/credits", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
        dispatch(std::move(callback), [this, request, id = std::move(id)] {
            auth_.require(request->getHeader("authorization"));
            if (request->method() == drogon::Get) return toJson(personWriter_.getCredits(idOf(id)));
            const auto result = personWriter_.saveCredits(idOf(id), creditsOf(bodyOf(request)));
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
            Json::Value result;
            result["username"] = auth_.require(request->getHeader("authorization"));
            result["midi_import_enabled"] = importer_.enabled();
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
            auth_.require(request->getHeader("authorization"));
            auto body = bodyOf(request);
            const bool hasFile = body.isMember("file");
            if (hasFile && !body.isMember("request_id"))
                throw ApiError(400, "INVALID_INPUT", "A file requires request_id for safe retries.");
            if (!body.isMember("request_id")) {
                const auto entry = writer_.create(entryOf(body, false));
                logEvent("midi_created"); return toJson(entry);
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
            const auto entry = importer_.create(entryOf(body, false), requestId, upload);
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
