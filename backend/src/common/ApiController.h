#pragma once
#include <drogon/drogon.h>
#include <trantor/utils/ConcurrentTaskQueue.h>
#include <atomic>
#include "midi/MidiService.h"
#include "person/PersonService.h"
#include "person/PersonWriteService.h"
#include "auth/AuthService.h"
#include "midi/MidiWriteService.h"
#include "recovery/RecoveryWriteService.h"
#include "installation/InstallationService.h"
#include "midi/MidiImportService.h"
#include "catalog/CatalogService.h"

namespace lostmidi {
class ApiController {
public:
    ApiController(midi::MidiService& midis, person::PersonService& people,
                  drogon::orm::DbClientPtr db, int workerCount, auth::AuthService& auth,
                  midi::MidiWriteService& writer, person::PersonWriteService& personWriter,
                  recovery::RecoveryWriteService& recoveryWriter, installation::InstallationService& installation,
                  midi::MidiImportService& importer, storage::IObjectStorage& objects, catalog::CatalogService& catalog);
    void registerRoutes();
private:
    using Callback = std::function<void(const drogon::HttpResponsePtr&)>;
    void dispatch(Callback callback, std::function<Json::Value()> work, int successStatus = 200);
    void dispatchResponse(Callback callback, std::function<drogon::HttpResponsePtr()> work);
    Json::Value submitAdminChange(const auth::SessionPrincipal& actor, const std::string& type,
                                  std::int64_t entityId, const Json::Value& payload);
    void registerAdminRoutes();
    void registerAdminReviewQueueRoutes();
    void registerAdminRecoveryRoutes();
    void registerInstallationRoutes();
    void registerAdminFileRoutes();
    void registerCatalogRoutes();
    void registerArticleRoutes();
    auth::SessionPrincipal requireFilePrincipal(const drogon::HttpRequestPtr& request);
    midi::MidiService& midis_;
    person::PersonService& people_;
    drogon::orm::DbClientPtr db_;
    auth::AuthService& auth_;
    midi::MidiWriteService& writer_;
    person::PersonWriteService& personWriter_;
    recovery::RecoveryWriteService& recoveryWriter_;
    installation::InstallationService& installation_;
    midi::MidiImportService& importer_;
    storage::IObjectStorage& objects_;
    catalog::CatalogService& catalog_;
    std::atomic<int> pending_{0};
    std::atomic<int> importsPending_{0};
    std::atomic<int> downloadsPending_{0};
    // Declared last: joins its worker threads before the dependencies die.
    trantor::ConcurrentTaskQueue workers_;
};
}  // namespace lostmidi
