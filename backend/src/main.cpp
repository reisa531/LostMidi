#include "common/ApiController.h"
#include "common/Config.h"
#include "common/Database.h"
#include "common/Log.h"
#include "catalog/PostgresCatalogRepository.h"
#include "midi/PostgresMidiRepository.h"
#include "person/PostgresPersonRepository.h"
#include "recovery/PostgresRecoveryRepository.h"
#include "storage/LocalObjectStorage.h"
#include "storage/S3ObjectStorage.h"
#include <iostream>

int main(int argc, char** argv) {
    using namespace lostmidi;
    try {
        const bool cleanup = argc == 2 && std::string(argv[1]) == "--cleanup-imports";
        if (argc != 1 && !cleanup) throw std::runtime_error("Unknown command.");
        const auto config = Config::fromEnvironment();
        logEvent("backend_startup");
        drogon::app().setLogLevel(trantor::Logger::kWarn);
        auto db = drogon::orm::DbClient::newPgClient(config.databaseUrl, static_cast<std::size_t>(config.dbPoolSize));
        db->setTimeout(5.0);
        requireDatabaseReady(db);
        logEvent("database_connected");
        std::unique_ptr<storage::IObjectStorage> objects;
        if (config.storageBackend == "s3") objects = std::make_unique<storage::S3ObjectStorage>(storage::S3Config::fromEnvironment());
        else objects = std::make_unique<storage::LocalObjectStorage>(config.storagePath);
        midi::PostgresMidiRepository midiRepository(db);
        midi::MidiImportService importer(midiRepository, *objects, config.importEnabled);
        if (cleanup) { std::cout << "Removed tracked orphan objects: " << importer.cleanup() << '\n'; return 0; }
        person::PostgresPersonRepository personRepository(db);
        recovery::PostgresRecoveryRepository recoveryRepository(db);
        recovery::RecoveryService history(recoveryRepository);
        midi::MidiService midis(midiRepository, personRepository, history);
        person::PersonService people(personRepository);
        const auto environment = [](const char* name) { const char* value = std::getenv(name); return std::string(value ? value : ""); };
        auth::AuthRepository authRepository(db);
        auth::AuthService auth(authRepository, environment("ADMIN_USERNAME"), environment("ADMIN_PASSWORD_HASH"));
        installation::InstallationRepository installationRepository(db);
        installation::InstallationService installation(installationRepository, environment("INSTALLATION_TOKEN"), auth.hasEnvironmentCredentials());
        installation.initializeLegacy();
        midi::MidiWriteService writer(midiRepository);
        person::PersonWriteService personWriter(personRepository);
        recovery::RecoveryWriteService recoveryWriter(recoveryRepository);
        catalog::PostgresCatalogRepository catalogRepository(db);
        catalog::CatalogService catalog(catalogRepository);
        ApiController controller(midis, people, db, config.workerThreads, auth, writer, personWriter, recoveryWriter, installation, importer, *objects, catalog);
        // Atomic creation carries base64 plus metadata; the decoded file limit is enforced separately.
        drogon::app().setClientMaxBodySize(21 * 1000 * 1000);
        drogon::app().setClientMaxMemoryBodySize(21 * 1000 * 1000);
        controller.registerRoutes();
        drogon::app().setThreadNum(static_cast<std::size_t>(config.httpThreads));
        drogon::app().addListener(config.host, config.port);
        drogon::app().registerBeginningAdvice([] { logEvent("backend_listening"); });
        drogon::app().run();
        logEvent("backend_stopped"); return 0;
    } catch (...) {
        logEvent("startup_failed"); return 1;
    }
}
