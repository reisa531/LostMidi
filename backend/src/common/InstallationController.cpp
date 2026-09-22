#include "common/ApiController.h"
#include "common/Log.h"

namespace lostmidi {
void ApiController::registerInstallationRoutes() {
    drogon::app().registerHandler("/api/v1/installation", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            if (request->method() == drogon::Get) return installation_.status();
            const auto body = request->getJsonObject();
            const auto result = installation_.install(request->getHeader("x-installation-token"), body ? *body : Json::Value{});
            logEvent("site_installed");
            return result;
        }, request->method() == drogon::Post ? 201 : 200);
    }, {drogon::Get, drogon::Post});
}
}  // namespace lostmidi
