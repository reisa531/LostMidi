#pragma once
#include <drogon/drogon.h>
#include <trantor/utils/ConcurrentTaskQueue.h>
#include <atomic>
#include "midi/MidiService.h"
#include "person/PersonService.h"
#include "person/PersonWriteService.h"
#include "auth/AuthService.h"
#include "midi/MidiWriteService.h"

namespace lostmidi {
class ApiController {
public:
    ApiController(midi::MidiService& midis, person::PersonService& people,
                  drogon::orm::DbClientPtr db, int workerCount, auth::AuthService& auth, midi::MidiWriteService& writer, person::PersonWriteService& personWriter);
    void registerRoutes();
private:
    using Callback = std::function<void(const drogon::HttpResponsePtr&)>;
    void dispatch(Callback callback, std::function<Json::Value()> work, int successStatus = 200);
    void registerAdminRoutes();
    midi::MidiService& midis_;
    person::PersonService& people_;
    drogon::orm::DbClientPtr db_;
    auth::AuthService& auth_;
    midi::MidiWriteService& writer_;
    person::PersonWriteService& personWriter_;
    std::atomic<int> pending_{0};
    // Declared last: joins its worker threads before the dependencies die.
    trantor::ConcurrentTaskQueue workers_;
};
}  // namespace lostmidi
