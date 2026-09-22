#pragma once
#include "common/Database.h"
#include <json/json.h>
#include <chrono>
#include <mutex>
#include <optional>
#include <string>

namespace lostmidi::installation {
struct Site {
    std::string name = "Lost MIDI Archive";
    std::string description = "记录早期网络 MIDI 的作品、人物、历史来源与寻回过程。";
};
struct InstallationInput {
    Site site;
    std::string username;
    std::string password;
};
InstallationInput parseInput(const Json::Value& body);
bool validInstallationToken(const std::string& token);

class InstallationRepository {
public:
    explicit InstallationRepository(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    std::optional<Site> read();
    void markEnvironmentInstalled();
    void create(const Site& site, const std::string& username, const std::string& passwordHash);
private:
    drogon::orm::DbClientPtr db_;
};

class AttemptLimiter {
public:
    void acquire();
private:
    std::mutex mutex_;
    std::chrono::steady_clock::time_point window_ = std::chrono::steady_clock::now();
    int attempts_ = 0;
};
// All production service instances in a process share this limit. Tests can isolate their budgets.
AttemptLimiter& processLimiter();

class InstallationService {
public:
    InstallationService(InstallationRepository& repository, std::string token, bool environmentInstalled,
                        AttemptLimiter& limiter = processLimiter());
    void initializeLegacy();
    Json::Value status();
    Json::Value install(const std::string& token, const Json::Value& body);
private:
    InstallationRepository& repository_;
    std::string token_;
    bool environmentInstalled_;
    AttemptLimiter& limiter_;
};
}  // namespace lostmidi::installation
