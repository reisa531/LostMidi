#pragma once
#include "common/Database.h"
#include <chrono>
#include <mutex>

namespace lostmidi::auth {
struct Credentials {
    std::string username;
    std::string passwordHash;
    std::string userId;
    std::string role = "super_admin";
};
struct SessionPrincipal {
    std::string username;
    std::string role;
    std::string userId;
    std::string credentialId;
};
class AuthRepository {
public:
    explicit AuthRepository(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    void create(const std::string& hash, const std::string& identity, const Credentials& credentials);
    bool valid(const std::string& hash, const std::string& identity);
    void remove(const std::string& hash);
    std::optional<Credentials> credentials(const std::string& username);
    std::optional<Credentials> disabledCredentials(const std::string& username);
    std::optional<Credentials> credentialsById(const std::string& userId);
    std::optional<SessionPrincipal> session(const std::string& hash);
    bool hasDatabaseCredentials();
private:
    drogon::orm::DbClientPtr db_;
};
class AuthService {
public:
    AuthService(AuthRepository& repository, std::string username, std::string passwordHash);
    std::string login(const std::string& username, const std::string& password);
    std::string require(const std::string& authorization);
    SessionPrincipal requirePrincipal(const std::string& authorization);
    SessionPrincipal requireSuperAdmin(const std::string& authorization);
    void logout(const std::string& authorization);
    bool hasEnvironmentCredentials() const;
    bool isEnvironmentUsername(const std::string& username) const;
private:
    std::optional<Credentials> credentials(const std::string& username);
    std::string tokenFrom(const std::string& authorization) const;
    AuthRepository& repository_;
    Credentials environment_;
    std::mutex mutex_;
    std::chrono::steady_clock::time_point window_ = std::chrono::steady_clock::now();
    int attempts_ = 0;
};
}
