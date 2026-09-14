#include "common/ApiController.h"
#include "common/Json.h"
#include "common/Log.h"

namespace lostmidi {
namespace {
drogon::HttpResponsePtr errorResponse(int status, const std::string& code, const std::string& message) {
    Json::Value body;
    body["error"]["code"] = code;
    body["error"]["message"] = message;
    auto response = drogon::HttpResponse::newHttpJsonResponse(body);
    response->setStatusCode(static_cast<drogon::HttpStatusCode>(status));
    logEvent("http_error", status);
    return response;
}
}
ApiController::ApiController(midi::MidiService& midis, person::PersonService& people,
                             drogon::orm::DbClientPtr db, int workerCount, auth::AuthService& auth, midi::MidiWriteService& writer)
    : midis_(midis), people_(people), db_(std::move(db)), auth_(auth), writer_(writer), workers_(static_cast<std::size_t>(workerCount), "archive") {}

void ApiController::dispatch(Callback callback, std::function<Json::Value()> work, int successStatus) {
    if (pending_.fetch_add(1) >= 256) {
        --pending_;
        callback(errorResponse(503, "SERVER_BUSY", "Please retry shortly."));
        return;
    }
    workers_.runTaskInQueue([this, callback = std::move(callback), work = std::move(work), successStatus] {
        drogon::HttpResponsePtr response;
        try {
            response = drogon::HttpResponse::newHttpJsonResponse(work());
            response->setStatusCode(static_cast<drogon::HttpStatusCode>(successStatus));
        } catch (const ApiError& error) {
            response = errorResponse(error.status, error.code, error.what());
        } catch (const drogon::orm::DrogonDbException&) {
            logEvent("database_error");
            response = errorResponse(503, "DATABASE_UNAVAILABLE", "The archive is temporarily unavailable.");
        } catch (...) {
            logEvent("unexpected_exception");
            response = errorResponse(500, "INTERNAL_ERROR", "An unexpected error occurred.");
        }
        --pending_;
        response->addHeader("Cache-Control", "no-store");
        callback(response);
    });
}

void ApiController::registerRoutes() {
    registerAdminRoutes();
    drogon::app().setCustomErrorHandler([](drogon::HttpStatusCode status) {
        return errorResponse(static_cast<int>(status), "HTTP_ERROR", "The request could not be processed.");
    });
    drogon::app().registerHandler("/health", [](const drogon::HttpRequestPtr&, Callback&& callback) {
        Json::Value body;
        body["status"] = "ok";
        callback(drogon::HttpResponse::newHttpJsonResponse(body));
    }, {drogon::Get});
    drogon::app().registerHandler("/ready", [this](const drogon::HttpRequestPtr&, Callback&& callback) {
        dispatch(std::move(callback), [this] {
            db_->execSqlSync("SELECT id FROM midi_entries LIMIT 1");
            Json::Value body;
            body["status"] = "ok";
            return body;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/midis", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            Page page;
            const auto& params = request->getParameters();
            if (params.contains("page")) page.number = positiveInteger(params.at("page"), 1000000, "page");
            if (params.contains("pageSize")) page.size = positiveInteger(params.at("pageSize"), 100, "pageSize");
            const auto result = midis_.list(page);
            Json::Value body;
            body["data"] = Json::Value(Json::arrayValue);
            for (const auto& summary : result.data) {
                auto entry = toJson(summary.entry);
                entry["credits"] = jsonArray(summary.credits);
                body["data"].append(entry);
            }
            body["pagination"]["page"] = page.number;
            body["pagination"]["pageSize"] = page.size;
            body["pagination"]["total"] = Json::Int64(result.total);
            return body;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/midis/{1}", [this](const drogon::HttpRequestPtr&, Callback&& callback, std::string slug) {
        dispatch(std::move(callback), [this, slug = std::move(slug)] { return toJson(midis_.getBySlug(slug)); });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/people/{1}", [this](const drogon::HttpRequestPtr&, Callback&& callback, std::string value) {
        dispatch(std::move(callback), [this, value = std::move(value)] {
            std::int64_t id = 0;
            const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), id);
            if (error != std::errc{} || end != value.data() + value.size() || id < 1)
                throw ApiError(400, "INVALID_PERSON_ID", "Person id must be a positive 64-bit integer.");
            return toJson(people_.getById(id));
        });
    }, {drogon::Get});
}
}  // namespace lostmidi
