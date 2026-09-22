#pragma once
#include <cstdint>
#include <cstdlib>
#include <string>
#include "common/Pagination.h"

namespace lostmidi {
struct Config {
    std::string databaseUrl;
    std::string host;
    std::uint16_t port;
    std::string storagePath;
    int dbPoolSize;
    int httpThreads;
    int workerThreads;
    std::string storageBackend;
    bool importEnabled;

    static Config fromEnvironment() {
        const auto value = [](const char* name, const char* fallback = "") -> std::string {
            const auto* v = std::getenv(name); return v && *v ? v : fallback;
        };
        const auto required = [&](const char* name) {
            auto v = value(name); if (v.empty()) throw std::runtime_error(std::string("Required environment variable: ") + name); return v;
        };
        const auto integer = [&](const char* name, int fallback, int maximum) {
            const auto v = value(name); return v.empty() ? fallback : positiveInteger(v, maximum, name);
        };
        const auto storage = value("STORAGE_BACKEND", "local");
        const auto enabled = value("MIDI_IMPORT_ENABLED", "false");
        if (storage != "local" && storage != "s3") throw std::runtime_error("Invalid STORAGE_BACKEND.");
        if (enabled != "true" && enabled != "false") throw std::runtime_error("Invalid MIDI_IMPORT_ENABLED.");
        if (!value("VERCEL").empty() && storage == "local" && enabled == "true")
            throw std::runtime_error("Vercel imports require durable S3 storage.");
        const auto port = value("PORT").empty() ? required("BACKEND_PORT") : value("PORT");
        return {required("DATABASE_URL"), required("BACKEND_HOST"),
                static_cast<std::uint16_t>(positiveInteger(port, 65535, "PORT")),
                storage == "local" ? required("STORAGE_PATH") : "", integer("DB_POOL_SIZE", 4, 64),
                integer("HTTP_THREADS", 2, 64), integer("WORKER_THREADS", 4, 64), storage, enabled == "true"};
    }
};
}  // namespace lostmidi
