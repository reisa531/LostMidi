#include "common/ApiController.h"
#include "catalog/Json.h"

namespace lostmidi {
void ApiController::registerCatalogRoutes() {
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
            return catalog::toJson(catalog_.people(catalog::parsePeoplePage({parameters.begin(), parameters.end()})));
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
