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

    static Config fromEnvironment() {
        const auto required = [](const char* name) -> std::string {
            const auto* value = std::getenv(name);
            if (!value || !*value) throw std::runtime_error(std::string("Required environment variable: ") + name);
            return value;
        };
        const auto integer = [](const char* name, int fallback, int maximum) {
            const auto* value = std::getenv(name);
            return value ? positiveInteger(value, maximum, name) : fallback;
        };
        return {required("DATABASE_URL"), required("BACKEND_HOST"),
                static_cast<std::uint16_t>(positiveInteger(required("BACKEND_PORT"), 65535, "BACKEND_PORT")),
                required("STORAGE_PATH"), integer("DB_POOL_SIZE", 4, 64),
                integer("HTTP_THREADS", 2, 64), integer("WORKER_THREADS", 4, 64)};
    }
};
}  // namespace lostmidi
