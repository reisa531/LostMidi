#pragma once
#include "common/Database.h"
#include <chrono>
#include <mutex>

namespace lostmidi::auth {
class AuthRepository {
public:
    explicit AuthRepository(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    void create(const std::string& hash, const std::string& identity);
    bool valid(const std::string& hash, const std::string& identity);
    void remove(const std::string& hash);
private:
    drogon::orm::DbClientPtr db_;
};
class AuthService {
public:
    AuthService(AuthRepository& repository, std::string username, std::string passwordHash);
    std::string login(const std::string& username, const std::string& password);
    std::string require(const std::string& authorization);
    void logout(const std::string& authorization);
private:
    std::string tokenFrom(const std::string& authorization) const;
    AuthRepository& repository_;
    std::string username_, passwordHash_, identity_;
    std::mutex mutex_;
    std::chrono::steady_clock::time_point window_ = std::chrono::steady_clock::now();
    int attempts_ = 0;
};
}
