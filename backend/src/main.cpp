#include "common/ApiController.h"
#include "common/Config.h"
#include "common/Log.h"
#include "midi/PostgresMidiRepository.h"
#include "person/PostgresPersonRepository.h"
#include "recovery/PostgresRecoveryRepository.h"
#include "storage/LocalObjectStorage.h"

int main() {
    using namespace lostmidi;
    try {
        const auto config = Config::fromEnvironment();
        logEvent("backend_startup");
        // Application logs are structured; suppress verbose framework internals.
        drogon::app().setLogLevel(trantor::Logger::kWarn);
        auto db = drogon::orm::DbClient::newPgClient(config.databaseUrl, static_cast<std::size_t>(config.dbPoolSize));
        db->setTimeout(5.0);
        db->execSqlSync("SELECT id FROM midi_entries LIMIT 1");
        logEvent("database_connected");
        storage::LocalObjectStorage objects(config.storagePath);
        midi::PostgresMidiRepository midiRepository(db);
        person::PostgresPersonRepository personRepository(db);
        recovery::PostgresRecoveryRepository recoveryRepository(db);
        recovery::RecoveryService history(recoveryRepository);
        midi::MidiService midis(midiRepository, personRepository, history);
        person::PersonService people(personRepository);
        const auto environment = [](const char* name) { const char* value = std::getenv(name); return std::string(value ? value : ""); };
        auth::AuthRepository authRepository(db);
        auth::AuthService auth(authRepository, environment("ADMIN_USERNAME"), environment("ADMIN_PASSWORD_HASH"));
        midi::MidiWriteService writer(midiRepository);
        ApiController controller(midis, people, db, config.workerThreads, auth, writer);
        drogon::app().setClientMaxBodySize(128 * 1024);
        controller.registerRoutes();
        drogon::app().setThreadNum(static_cast<std::size_t>(config.httpThreads));
        drogon::app().addListener(config.host, config.port);
        drogon::app().registerBeginningAdvice([] { logEvent("backend_listening"); });
        drogon::app().run();
        logEvent("backend_stopped");
        return 0;
    } catch (...) {
        logEvent("startup_failed");
        return 1;
    }
}
