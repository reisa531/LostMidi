#include "installation/InstallationService.h"
#include "auth/Password.h"
#include "common/Transaction.h"
#include <algorithm>
#include <cstdint>

namespace lostmidi::installation {
namespace {
[[noreturn]] void invalidInput() {
    throw ApiError(400, "INVALID_INPUT", "Invalid installation fields.");
}
bool asciiLetterOrDigit(unsigned char c) {
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}
bool whitespace(std::uint32_t c) {
    // Unicode White_Space plus BOM, matching browser String.trim().
    return (c >= 9 && c <= 13) || c == 32 || c == 0xa0 || c == 0x1680 ||
        (c >= 0x2000 && c <= 0x200a) || c == 0x2028 || c == 0x2029 ||
        c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff;
}
std::string text(const Json::Value& body, const char* field, bool trim) {
    if (!body[field].isString()) invalidInput();
    const auto value = body[field].asString();
    std::size_t first = value.size(), last = 0;
    // Validate UTF-8 before PostgreSQL sees it; reject NUL, overlong encodings and surrogates.
    for (std::size_t i = 0; i < value.size();) {
        const auto start = i;
        const auto lead = static_cast<unsigned char>(value[i++]);
        std::uint32_t point = lead;
        int remaining = 0;
        std::uint32_t minimum = 0;
        if (lead >= 0xc2 && lead <= 0xdf) { point = lead & 0x1f; remaining = 1; minimum = 0x80; }
        else if (lead >= 0xe0 && lead <= 0xef) { point = lead & 0x0f; remaining = 2; minimum = 0x800; }
        else if (lead >= 0xf0 && lead <= 0xf4) { point = lead & 7; remaining = 3; minimum = 0x10000; }
        else if (lead >= 0x80) invalidInput();
        for (int j = 0; j < remaining; ++j) {
            if (i == value.size()) invalidInput();
            const auto byte = static_cast<unsigned char>(value[i++]);
            if ((byte & 0xc0) != 0x80) invalidInput();
            point = (point << 6) | (byte & 0x3f);
        }
        if (point == 0 || point < minimum || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) invalidInput();
        if (!whitespace(point)) { first = (std::min)(first, start); last = i; }
    }
    if (!trim) return value;
    return first == value.size() ? std::string{} : value.substr(first, last - first);
}
Json::Value response(bool installed, bool enabled, const Site& site) {
    Json::Value body;
    body["installed"] = installed;
    body["installation_enabled"] = enabled;
    body["site"]["name"] = site.name;
    body["site"]["description"] = site.description;
    return body;
}
[[noreturn]] void alreadyInstalled() {
    throw ApiError(409, "ALREADY_INSTALLED", "The site is already installed.");
}
}  // namespace

InstallationInput parseInput(const Json::Value& body) {
    if (!body.isObject() || body.size() != 4) invalidInput();
    for (const auto& field : body.getMemberNames())
        if (field != "site_name" && field != "site_description" && field != "username" && field != "password") invalidInput();
    InstallationInput input;
    input.site.name = text(body, "site_name", true);
    input.site.description = text(body, "site_description", true);
    input.username = text(body, "username", false);
    input.password = text(body, "password", false);
    if (input.site.name.empty() || input.site.name.size() > 200 || input.site.description.size() > 1000 ||
        input.username.size() < 3 || input.username.size() > 64 ||
        !std::all_of(input.username.begin(), input.username.end(), [](unsigned char c) {
            return asciiLetterOrDigit(c) || c == '_' || c == '.' || c == '-';
        }) || input.password.size() < 12 || input.password.size() > 1024) invalidInput();
    return input;
}
bool validInstallationToken(const std::string& token) {
    return token.size() >= 32 && token.size() <= 128 &&
        std::all_of(token.begin(), token.end(), [](unsigned char c) {
            return asciiLetterOrDigit(c) || c == '_' || c == '-';
        });
}
std::optional<Site> InstallationRepository::read() {
    const auto rows = db_->execSqlSync("SELECT site_name, site_description FROM site_installation WHERE id=1");
    if (rows.empty()) return std::nullopt;
    return Site{rows[0]["site_name"].as<std::string>(), rows[0]["site_description"].as<std::string>()};
}
void InstallationRepository::markEnvironmentInstalled() {
    TransactionScope transaction(db_);
    const Site defaults;
    transaction.db->execSqlSync(
        "INSERT INTO site_installation(id, site_name, site_description, auth_source) VALUES(1,$1,$2,'environment') "
        "ON CONFLICT(id) DO NOTHING", defaults.name, defaults.description);
    transaction.commit();
}
void InstallationRepository::create(const Site& site, const std::string& username, const std::string& passwordHash) {
    TransactionScope transaction(db_);
    // The singleton PK arbitrates across processes; a loser never updates any stored value.
    const auto rows = transaction.db->execSqlSync(
        "INSERT INTO site_installation(id,site_name,site_description,auth_source,username,password_hash) "
        "VALUES(1,$1,$2,'database',$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id",
        site.name, site.description, username, passwordHash);
    if (rows.empty()) alreadyInstalled();
    transaction.db->execSqlSync(
        "INSERT INTO admin_users(username,password_hash,role,status) VALUES($1,$2,'super_admin','active') "
        "ON CONFLICT(username) DO NOTHING", username, passwordHash);
    transaction.commit();
}
void AttemptLimiter::acquire() {
    std::lock_guard lock(mutex_);
    const auto now = std::chrono::steady_clock::now();
    if (now - window_ >= std::chrono::minutes(1)) { window_ = now; attempts_ = 0; }
    if (attempts_ >= 10)
        throw ApiError(429, "INSTALLATION_RATE_LIMITED", "Too many installation attempts. Retry in one minute.");
    ++attempts_;
}
AttemptLimiter& processLimiter() {
    static AttemptLimiter limiter;
    return limiter;
}
InstallationService::InstallationService(InstallationRepository& repository, std::string token,
                                         bool environmentInstalled, AttemptLimiter& limiter)
    : repository_(repository), token_(std::move(token)), environmentInstalled_(environmentInstalled), limiter_(limiter) {
    if (!token_.empty() && !validInstallationToken(token_))
        throw std::runtime_error("Invalid INSTALLATION_TOKEN configuration.");
}
void InstallationService::initializeLegacy() {
    if (environmentInstalled_) repository_.markEnvironmentInstalled();
}
Json::Value InstallationService::status() {
    // Always query, including for env deployments: a DB outage must never look uninstalled.
    const auto site = repository_.read();
    const bool installed = environmentInstalled_ || site.has_value();
    return response(installed, !installed && !token_.empty(), site.value_or(Site{}));
}
Json::Value InstallationService::install(const std::string& token, const Json::Value& body) {
    if (repository_.read() || environmentInstalled_) alreadyInstalled();
    if (token_.empty()) throw ApiError(403, "INSTALLATION_DISABLED", "Site installation is disabled.");
    limiter_.acquire();
    if (!auth::constantTimeEqual(token, token_))
        throw ApiError(403, "INVALID_INSTALLATION_TOKEN", "Invalid installation token.");
    const auto input = parseInput(body);
    const auto passwordHash = auth::hashPassword(input.password);
    repository_.create(input.site, input.username, passwordHash);
    return response(true, false, input.site);
}
}  // namespace lostmidi::installation
