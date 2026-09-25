#include "auth/AuthService.h"
#include "auth/Password.h"
#include "common/Error.h"
#include <algorithm>

namespace lostmidi::auth {
void AuthRepository::create(const std::string& hash, const std::string& identity, const Credentials& credentials) {
    db_->execSqlSync("DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP");
    db_->execSqlSync(
        "INSERT INTO admin_sessions(token_hash, credential_id, expires_at, user_id, actor_username, role) "
        "VALUES ($1,$2,CURRENT_TIMESTAMP + INTERVAL '8 hours',NULLIF($3,'')::uuid,$4,$5)",
        hash, identity, credentials.userId, credentials.username, credentials.role);
}
bool AuthRepository::valid(const std::string& hash, const std::string& identity) {
    return !db_->execSqlSync("SELECT 1 FROM admin_sessions WHERE token_hash = $1 AND credential_id = $2 AND expires_at > CURRENT_TIMESTAMP", hash, identity).empty();
}
void AuthRepository::remove(const std::string& hash) { db_->execSqlSync("DELETE FROM admin_sessions WHERE token_hash = $1", hash); }
std::optional<Credentials> AuthRepository::credentials(const std::string& username) {
    const auto users = db_->execSqlSync(
        "SELECT id::text,username,password_hash,role FROM admin_users WHERE username=$1 AND status='active' AND password_hash IS NOT NULL", username);
    if (!users.empty()) return Credentials{users[0]["username"].as<std::string>(), users[0]["password_hash"].as<std::string>(),
        users[0]["id"].as<std::string>(), users[0]["role"].as<std::string>()};
    return std::nullopt;
}
std::optional<Credentials> AuthRepository::disabledCredentials(const std::string& username) {
    const auto users = db_->execSqlSync(
        "SELECT id::text,username,password_hash,role FROM admin_users WHERE username=$1 AND status='disabled' AND password_hash IS NOT NULL", username);
    if (users.empty()) return std::nullopt;
    return Credentials{users[0]["username"].as<std::string>(), users[0]["password_hash"].as<std::string>(),
        users[0]["id"].as<std::string>(), users[0]["role"].as<std::string>()};
}
std::optional<Credentials> AuthRepository::credentialsById(const std::string& userId) {
    const auto rows = db_->execSqlSync("SELECT id::text,username,password_hash,role FROM admin_users WHERE id=$1::uuid AND status='active' AND password_hash IS NOT NULL", userId);
    if (rows.empty()) return std::nullopt;
    return Credentials{rows[0]["username"].as<std::string>(), rows[0]["password_hash"].as<std::string>(),
        rows[0]["id"].as<std::string>(), rows[0]["role"].as<std::string>()};
}
std::optional<SessionPrincipal> AuthRepository::session(const std::string& hash) {
    const auto rows = db_->execSqlSync(
        "SELECT s.actor_username,s.role AS session_role,s.user_id::text,u.username,u.role,u.password_hash,u.status,s.credential_id "
        "FROM admin_sessions s LEFT JOIN admin_users u ON u.id=s.user_id "
        "WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP", hash);
    if (rows.empty()) return std::nullopt;
    if (rows[0]["user_id"].isNull())
        return SessionPrincipal{rows[0]["actor_username"].as<std::string>(), "super_admin", "", rows[0]["credential_id"].as<std::string>()};
    if (rows[0]["status"].isNull() || rows[0]["status"].as<std::string>() != "active" || rows[0]["password_hash"].isNull()) return std::nullopt;
    return SessionPrincipal{rows[0]["username"].as<std::string>(), rows[0]["role"].as<std::string>(),
        rows[0]["user_id"].as<std::string>(), rows[0]["credential_id"].as<std::string>()};
}
bool AuthRepository::hasDatabaseCredentials() {
    return !db_->execSqlSync("SELECT 1 FROM admin_users WHERE status='active' AND password_hash IS NOT NULL LIMIT 1").empty();
}
AuthService::AuthService(AuthRepository& repository, std::string username, std::string passwordHash)
    : repository_(repository), environment_{std::move(username), std::move(passwordHash)} {
    if ((!environment_.passwordHash.empty() && !validPasswordHash(environment_.passwordHash)) ||
        environment_.username.size() > 100 || environment_.username.find('\0') != std::string::npos)
        throw std::runtime_error("Invalid administrator configuration.");
}
bool AuthService::hasEnvironmentCredentials() const {
    return !environment_.username.empty() && !environment_.passwordHash.empty();
}
bool AuthService::isEnvironmentUsername(const std::string& username) const {
    return hasEnvironmentCredentials() && username == environment_.username;
}
std::optional<Credentials> AuthService::credentials(const std::string& username) {
    if (hasEnvironmentCredentials() && username == environment_.username)
        return Credentials{environment_.username, environment_.passwordHash, "", "super_admin"};
    // Do not cache: another instance may just have completed installation or changed a user.
    return repository_.credentials(username);
}
std::string AuthService::login(const std::string& username, const std::string& password) {
    const auto current = credentials(username);
    if (!current && !hasEnvironmentCredentials() && !repository_.hasDatabaseCredentials() &&
        !repository_.disabledCredentials(username))
        throw ApiError(503, "ADMIN_DISABLED", "Administrator credentials are not configured.");
    {
        std::lock_guard lock(mutex_);
        const auto now = std::chrono::steady_clock::now();
        if (now - window_ >= std::chrono::minutes(1)) { window_ = now; attempts_ = 0; }
        if (attempts_ >= 10) throw ApiError(429, "LOGIN_RATE_LIMITED", "Too many login attempts. Retry in one minute.");
        ++attempts_;
    }
    // Always verify the password, even for a wrong username.
    static const std::string dummyHash = "pbkdf2_sha256:600000:00000000000000000000000000000000:73cce23bed8110946640df7fee25f986fdd0ec35066980f5cfa99f6905bcbeb0";
    const bool passwordMatches = verifyPassword(password, current ? current->passwordHash : dummyHash);
    if (!current || !passwordMatches) {
        const auto disabled = current ? std::nullopt : repository_.disabledCredentials(username);
        if (disabled && verifyPassword(password, disabled->passwordHash))
            throw ApiError(403, "ACCOUNT_DISABLED", "Contact a super administrator through the About page to enable this account.");
        throw ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
    }
    const auto token = randomToken();
    repository_.create(digest(token), digest(current->username + ":" + current->passwordHash), *current);
    return token;
}
std::string AuthService::tokenFrom(const std::string& authorization) const {
    const auto token = authorization.starts_with("Bearer ") ? authorization.substr(7) : std::string{};
    if (token.size() != 64 || !std::all_of(token.begin(), token.end(), [](char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }))
        throw ApiError(401, "UNAUTHORIZED", "Administrator login is required.");
    return token;
}
std::string AuthService::require(const std::string& authorization) {
    return requirePrincipal(authorization).username;
}
SessionPrincipal AuthService::requirePrincipal(const std::string& authorization) {
    const auto token = tokenFrom(authorization);
    const auto session = repository_.session(digest(token));
    if (!session) throw ApiError(401, "UNAUTHORIZED", "Administrator session is invalid or expired.");
    if (!session->userId.empty()) {
        const auto current = repository_.credentialsById(session->userId);
        if (!current || (hasEnvironmentCredentials() && current->username == environment_.username) ||
            session->credentialId != digest(current->username + ":" + current->passwordHash))
            throw ApiError(401, "UNAUTHORIZED", "Administrator session is invalid or expired.");
        return {current->username, current->role, current->userId, session->credentialId};
    }
    const auto current = credentials(session->username);
    if (!current || session->credentialId != digest(current->username + ":" + current->passwordHash))
        throw ApiError(401, "UNAUTHORIZED", "Administrator session is invalid or expired.");
    return {current->username, current->role, current->userId, session->credentialId};
}
SessionPrincipal AuthService::requireSuperAdmin(const std::string& authorization) {
    auto principal = requirePrincipal(authorization);
    if (principal.role != "super_admin") throw ApiError(403, "FORBIDDEN", "Super administrator access is required.");
    return principal;
}
void AuthService::logout(const std::string& authorization) {
    repository_.remove(digest(tokenFrom(authorization)));
}
}
