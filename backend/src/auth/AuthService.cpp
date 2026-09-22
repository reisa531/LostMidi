#include "auth/AuthService.h"
#include "auth/Password.h"
#include "common/Error.h"
#include <algorithm>

namespace lostmidi::auth {
void AuthRepository::create(const std::string& hash, const std::string& identity) {
    db_->execSqlSync("DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP OR credential_id <> $1", identity);
    db_->execSqlSync("INSERT INTO admin_sessions(token_hash, credential_id, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '8 hours')", hash, identity);
}
bool AuthRepository::valid(const std::string& hash, const std::string& identity) {
    return !db_->execSqlSync("SELECT 1 FROM admin_sessions WHERE token_hash = $1 AND credential_id = $2 AND expires_at > CURRENT_TIMESTAMP", hash, identity).empty();
}
void AuthRepository::remove(const std::string& hash) { db_->execSqlSync("DELETE FROM admin_sessions WHERE token_hash = $1", hash); }
std::optional<Credentials> AuthRepository::credentials() {
    const auto rows = db_->execSqlSync("SELECT username, password_hash FROM site_installation WHERE id=1 AND auth_source='database'");
    if (rows.empty() || rows[0]["username"].isNull() || rows[0]["password_hash"].isNull()) return std::nullopt;
    return Credentials{rows[0]["username"].as<std::string>(), rows[0]["password_hash"].as<std::string>()};
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
std::optional<Credentials> AuthService::credentials() {
    if (hasEnvironmentCredentials()) return environment_;
    // Do not cache: another instance may just have completed installation or rotated credentials.
    return repository_.credentials();
}
std::string AuthService::login(const std::string& username, const std::string& password) {
    const auto current = credentials();
    if (!current) throw ApiError(503, "ADMIN_DISABLED", "Administrator credentials are not configured.");
    {
        std::lock_guard lock(mutex_);
        const auto now = std::chrono::steady_clock::now();
        if (now - window_ >= std::chrono::minutes(1)) { window_ = now; attempts_ = 0; }
        if (attempts_ >= 10) throw ApiError(429, "LOGIN_RATE_LIMITED", "Too many login attempts. Retry in one minute.");
        ++attempts_;
    }
    // Always verify the password, even for a wrong username.
    const bool passwordMatches = verifyPassword(password, current->passwordHash);
    if (!passwordMatches || username != current->username) throw ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
    const auto token = randomToken();
    repository_.create(digest(token), digest(current->username + ":" + current->passwordHash));
    return token;
}
std::string AuthService::tokenFrom(const std::string& authorization) const {
    const auto token = authorization.starts_with("Bearer ") ? authorization.substr(7) : std::string{};
    if (token.size() != 64 || !std::all_of(token.begin(), token.end(), [](char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }))
        throw ApiError(401, "UNAUTHORIZED", "Administrator login is required.");
    return token;
}
std::string AuthService::require(const std::string& authorization) {
    const auto token = tokenFrom(authorization);
    const auto current = credentials();
    if (!current || !repository_.valid(digest(token), digest(current->username + ":" + current->passwordHash)))
        throw ApiError(401, "UNAUTHORIZED", "Administrator session is invalid or expired.");
    return current->username;
}
void AuthService::logout(const std::string& authorization) {
    repository_.remove(digest(tokenFrom(authorization)));
}
}
