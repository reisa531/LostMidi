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
AuthService::AuthService(AuthRepository& repository, std::string username, std::string passwordHash)
    : repository_(repository), username_(std::move(username)), passwordHash_(std::move(passwordHash)), identity_(digest(username_ + ":" + passwordHash_)) {
    if ((!passwordHash_.empty() && !validPasswordHash(passwordHash_)) || username_.size() > 100)
        throw std::runtime_error("Invalid administrator configuration.");
}
std::string AuthService::login(const std::string& username, const std::string& password) {
    if (username_.empty() || passwordHash_.empty()) throw ApiError(503, "ADMIN_DISABLED", "Administrator credentials are not configured.");
    {
        std::lock_guard lock(mutex_);
        const auto now = std::chrono::steady_clock::now();
        if (now - window_ >= std::chrono::minutes(1)) { window_ = now; attempts_ = 0; }
        if (attempts_ >= 10) throw ApiError(429, "LOGIN_RATE_LIMITED", "Too many login attempts. Retry in one minute.");
        ++attempts_;
    }
    // Always verify the password, even for a wrong username.
    const bool passwordMatches = verifyPassword(password, passwordHash_);
    if (!passwordMatches || username != username_) throw ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
    const auto token = randomToken();
    repository_.create(digest(token), identity_);
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
    if (username_.empty() || passwordHash_.empty() || !repository_.valid(digest(token), identity_))
        throw ApiError(401, "UNAUTHORIZED", "Administrator session is invalid or expired.");
    return username_;
}
void AuthService::logout(const std::string& authorization) {
    repository_.remove(digest(tokenFrom(authorization)));
}
}
