#include <gtest/gtest.h>
#include "installation/InstallationService.h"
#include "auth/AuthService.h"
#include "auth/Password.h"
#include <cstdlib>
#include <future>
#include <memory>

using namespace lostmidi;
namespace {
// Public fixtures only. Never read DATABASE_URL or administrator deployment secrets.
const std::string installationToken(40, 't');
const std::string legacyHash = "pbkdf2_sha256:600000:00000000000000000000000000000000:73cce23bed8110946640df7fee25f986fdd0ec35066980f5cfa99f6905bcbeb0";
Json::Value input() {
    Json::Value body;
    body["site_name"] = "  Installation test archive  ";
    body["site_description"] = "  Isolated database test  ";
    body["username"] = "installed-admin";
    body["password"] = "installation-only-password";
    return body;
}
template<class Work> void expectApiError(Work work, int status, const std::string& code) {
    try { work(); FAIL() << "Expected API error " << code; }
    catch (const ApiError& error) { EXPECT_EQ(error.status, status); EXPECT_EQ(error.code, code); }
}
void expectPublicShape(const Json::Value& value) {
    ASSERT_TRUE(value.isObject());
    EXPECT_EQ(value.size(), 3u);
    EXPECT_TRUE(value["installed"].isBool());
    EXPECT_TRUE(value["installation_enabled"].isBool());
    ASSERT_TRUE(value["site"].isObject());
    EXPECT_EQ(value["site"].size(), 2u);
    EXPECT_TRUE(value["site"]["name"].isString());
    EXPECT_TRUE(value["site"]["description"].isString());
    const auto serialized = value.toStyledString();
    for (const auto& secret : {installationToken, legacyHash, std::string("installed-admin"),
            std::string("installation-only-password"), std::string("username"), std::string("password_hash"), std::string("database_url")})
        EXPECT_EQ(serialized.find(secret), std::string::npos);
}
class InstallationPostgres : public ::testing::Test {
protected:
    drogon::orm::DbClientPtr owner_, db_;
    std::string url_, schema_;
    bool created_ = false;
    installation::AttemptLimiter limiter_;

    drogon::orm::DbClientPtr connect() {
        // A connection-level startup option survives reconnects. Never fall back to public tables.
        auto connection = url_;
        const auto options = "-csearch_path=" + schema_;
        if (connection.starts_with("postgres://") || connection.starts_with("postgresql://"))
            connection += (connection.find('?') == std::string::npos ? "?" : "&") + std::string("options=-csearch_path%3D") + schema_;
        else connection += " options='" + options + "'";
        auto db = drogon::orm::DbClient::newPgClient(connection, 1);
        db->setTimeout(10.0);
        return db;
    }
    void SetUp() override {
        const char* url = std::getenv("LOSTMIDI_TEST_DATABASE_URL");
        if (!url || !*url) GTEST_SKIP() << "Set LOSTMIDI_TEST_DATABASE_URL to a dedicated test database migrated through 005.";
        url_ = url;
        owner_ = drogon::orm::DbClient::newPgClient(url_, 1);
        owner_->setTimeout(10.0);
        schema_ = "installation_test_" + auth::randomToken().substr(0, 24);
        owner_->execSqlSync("CREATE SCHEMA " + schema_);
        created_ = true;
        owner_->execSqlSync("CREATE TABLE " + schema_ + ".site_installation (LIKE public.site_installation INCLUDING ALL)");
        owner_->execSqlSync("CREATE TABLE " + schema_ + ".admin_sessions (LIKE public.admin_sessions INCLUDING ALL)");
        db_ = connect();
        // Minimal surrounding schema for read-only startup/readiness checks, all isolated.
        db_->execSqlSync("CREATE TABLE midi_entries (revision BIGINT)");
        db_->execSqlSync("CREATE TABLE people (revision BIGINT)");
        db_->execSqlSync("CREATE TABLE recovery_events (recovered_at TIMESTAMPTZ)");
        db_->execSqlSync("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY)");
        db_->execSqlSync("INSERT INTO schema_migrations VALUES ('004_optional_recovery_date.sql'), ('005_site_installation.sql')");
    }
    void TearDown() override {
        db_.reset();
        if (created_) {
            try { owner_->execSqlSync("DROP SCHEMA " + schema_ + " CASCADE"); }
            catch (...) { ADD_FAILURE() << "Could not remove isolated installation test schema."; }
        }
    }
};
TEST_F(InstallationPostgres, DefaultsDisabledTokensAndMalformedRequests) {
    installation::InstallationRepository repository(db_);
    installation::InstallationService service(repository, installationToken, false, limiter_);
    const auto status = service.status();
    expectPublicShape(status);
    EXPECT_FALSE(status["installed"].asBool());
    EXPECT_TRUE(status["installation_enabled"].asBool());
    EXPECT_EQ(status["site"]["name"].asString(), "Lost MIDI Archive");
    EXPECT_EQ(status["site"]["description"].asString(), "记录早期网络 MIDI 的作品、人物、历史来源与寻回过程。");
    installation::InstallationService disabled(repository, "", false, limiter_);
    EXPECT_FALSE(disabled.status()["installation_enabled"].asBool());
    expectApiError([&] { disabled.install(installationToken, input()); }, 403, "INSTALLATION_DISABLED");
    expectApiError([&] { service.install("", input()); }, 403, "INVALID_INSTALLATION_TOKEN");
    expectApiError([&] { service.install(std::string(40, 'x'), input()); }, 403, "INVALID_INSTALLATION_TOKEN");
    expectApiError([&] { service.install(installationToken, Json::Value{}); }, 400, "INVALID_INPUT");
    auto unknown = input(); unknown["backend_url"] = "not-accepted";
    expectApiError([&] { service.install(installationToken, unknown); }, 400, "INVALID_INPUT");
    EXPECT_TRUE(db_->execSqlSync("SELECT 1 FROM site_installation").empty());
    EXPECT_TRUE(db_->execSqlSync("SELECT 1 FROM admin_sessions").empty());
}
TEST_F(InstallationPostgres, InvalidRequestsShareLimitBeforeHashing) {
    installation::InstallationRepository firstRepository(db_);
    auto secondDb = connect();
    installation::InstallationRepository secondRepository(secondDb);
    installation::InstallationService first(firstRepository, installationToken, false, limiter_);
    installation::InstallationService second(secondRepository, installationToken, false, limiter_);
    auto unknown = input(); unknown["unknown"] = true;
    for (int i = 0; i < 10; ++i) {
        auto& service = i % 2 ? first : second;
        if (i % 2) expectApiError([&] { service.install("wrong", input()); }, 403, "INVALID_INSTALLATION_TOKEN");
        else expectApiError([&] { service.install(installationToken, unknown); }, 400, "INVALID_INPUT");
    }
    expectApiError([&] { second.install(installationToken, input()); }, 429, "INSTALLATION_RATE_LIMITED");
    EXPECT_TRUE(db_->execSqlSync("SELECT 1 FROM site_installation").empty());
}
TEST_F(InstallationPostgres, InstallsOnceWithoutLoginAndSurvivesNewInstances) {
    installation::InstallationRepository repository(db_);
    installation::InstallationService service(repository, installationToken, false, limiter_);
    auth::AuthRepository authRepository(db_);
    auth::AuthService authService(authRepository, "", "");
    expectApiError([&] { authService.login("installed-admin", "installation-only-password"); }, 503, "ADMIN_DISABLED");
    const auto installed = service.install(installationToken, input());
    expectPublicShape(installed);
    EXPECT_TRUE(installed["installed"].asBool());
    EXPECT_FALSE(installed["installation_enabled"].asBool());
    EXPECT_EQ(installed, service.status());
    EXPECT_EQ(installed["site"]["name"].asString(), "Installation test archive");
    EXPECT_EQ(installed["site"]["description"].asString(), "Isolated database test");
    EXPECT_TRUE(db_->execSqlSync("SELECT 1 FROM admin_sessions").empty());
    const auto rows = db_->execSqlSync("SELECT auth_source,username,password_hash,installed_at FROM site_installation");
    ASSERT_EQ(rows.size(), 1u);
    EXPECT_EQ(rows[0]["auth_source"].as<std::string>(), "database");
    EXPECT_EQ(rows[0]["username"].as<std::string>(), "installed-admin");
    EXPECT_FALSE(rows[0]["installed_at"].isNull());
    const auto hash = rows[0]["password_hash"].as<std::string>();
    EXPECT_TRUE(auth::validPasswordHash(hash));
    EXPECT_NE(hash, input()["password"].asString());
    const auto token = authService.login("installed-admin", "installation-only-password");
    EXPECT_EQ(authService.require("Bearer " + token), "installed-admin");
    auto otherDb = connect();
    installation::InstallationRepository restartedRepository(otherDb);
    installation::InstallationService restarted(restartedRepository, "", false, limiter_);
    auth::AuthRepository otherAuthRepository(otherDb);
    auth::AuthService otherAuth(otherAuthRepository, "", "");
    EXPECT_EQ(restarted.status(), installed);
    EXPECT_EQ(otherAuth.require("Bearer " + token), "installed-admin");
    EXPECT_NO_THROW(otherAuth.login("installed-admin", "installation-only-password"));
    auto replacement = input(); replacement["site_name"] = "Overwrite attempt";
    expectApiError([&] { service.install(installationToken, replacement); }, 409, "ALREADY_INSTALLED");
    expectApiError([&] { restarted.install("wrong", Json::Value{}); }, 409, "ALREADY_INSTALLED");
    EXPECT_EQ(restarted.status(), installed);
    EXPECT_EQ(db_->execSqlSync("SELECT password_hash FROM site_installation")[0][0].as<std::string>(), hash);
}
TEST_F(InstallationPostgres, ConcurrentIndependentConnectionsHaveExactlyOneWinner) {
    auto otherDb = connect();
    installation::InstallationRepository firstRepository(db_), secondRepository(otherDb);
    installation::InstallationService first(firstRepository, installationToken, false, limiter_);
    installation::InstallationService second(secondRepository, installationToken, false, limiter_);
    auto firstBody = input(), secondBody = input();
    firstBody["site_name"] = "First"; firstBody["username"] = "first-admin";
    secondBody["site_name"] = "Second"; secondBody["username"] = "second-admin";
    std::promise<void> start;
    auto ready = start.get_future().share();
    auto install = [&](installation::InstallationService& service, const Json::Value& body) {
        ready.wait();
        try { service.install(installationToken, body); return 201; }
        catch (const ApiError& error) { EXPECT_EQ(error.code, "ALREADY_INSTALLED"); return error.status; }
    };
    auto a = std::async(std::launch::async, [&] { return install(first, firstBody); });
    auto b = std::async(std::launch::async, [&] { return install(second, secondBody); });
    start.set_value();
    const int firstResult = a.get(), secondResult = b.get();
    EXPECT_TRUE((firstResult == 201 && secondResult == 409) || (firstResult == 409 && secondResult == 201));
    const auto rows = db_->execSqlSync("SELECT site_name,username FROM site_installation");
    ASSERT_EQ(rows.size(), 1u);
    EXPECT_EQ(rows[0]["site_name"].as<std::string>(), firstResult == 201 ? "First" : "Second");
    EXPECT_EQ(rows[0]["username"].as<std::string>(), firstResult == 201 ? "first-admin" : "second-admin");
}
TEST_F(InstallationPostgres, StatementAndCommitFailuresRollBackAndPermitRetry) {
    installation::InstallationRepository repository(db_);
    installation::InstallationService service(repository, installationToken, false, limiter_);
    EXPECT_THROW(repository.create(installation::Site{}, "installed-admin", "invalid-hash"), drogon::orm::DrogonDbException);
    EXPECT_FALSE(service.status()["installed"].asBool());
    // Deferred failure occurs after INSERT succeeded, exercising confirmed COMMIT, not just input validation.
    db_->execSqlSync("CREATE FUNCTION reject_installation_commit() RETURNS trigger LANGUAGE plpgsql AS $$ "
        "BEGIN RAISE EXCEPTION 'injected installation commit failure'; RETURN NEW; END; $$");
    db_->execSqlSync("CREATE CONSTRAINT TRIGGER reject_installation_commit AFTER INSERT ON site_installation "
        "DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_installation_commit()");
    EXPECT_THROW(service.install(installationToken, input()), drogon::orm::DrogonDbException);
    EXPECT_FALSE(service.status()["installed"].asBool());
    EXPECT_TRUE(db_->execSqlSync("SELECT 1 FROM site_installation").empty());
    EXPECT_TRUE(db_->execSqlSync("SELECT 1 FROM admin_sessions").empty());
    db_->execSqlSync("DROP TRIGGER reject_installation_commit ON site_installation");
    EXPECT_TRUE(service.install(installationToken, input())["installed"].asBool());
}
TEST_F(InstallationPostgres, LegacyUpgradePersistsLockWithoutCopyingEnvironmentCredentials) {
    installation::InstallationRepository repository(db_);
    auth::AuthRepository authRepository(db_);
    auth::AuthService legacyAuth(authRepository, "legacy-admin", legacyHash);
    ASSERT_TRUE(legacyAuth.hasEnvironmentCredentials());
    installation::InstallationService legacy(repository, installationToken, legacyAuth.hasEnvironmentCredentials(), limiter_);
    EXPECT_TRUE(legacy.status()["installed"].asBool());
    EXPECT_FALSE(legacy.status()["installation_enabled"].asBool());
    legacy.initializeLegacy();
    legacy.initializeLegacy();
    const auto rows = db_->execSqlSync("SELECT auth_source,username,password_hash FROM site_installation");
    ASSERT_EQ(rows.size(), 1u);
    EXPECT_EQ(rows[0]["auth_source"].as<std::string>(), "environment");
    EXPECT_TRUE(rows[0]["username"].isNull());
    EXPECT_TRUE(rows[0]["password_hash"].isNull());
    const auto session = legacyAuth.login("legacy-admin", "integration-only-password");
    EXPECT_EQ(legacyAuth.require("Bearer " + session), "legacy-admin");
    auto removedDb = connect();
    auth::AuthRepository removedAuthRepository(removedDb);
    auth::AuthService removedAuth(removedAuthRepository, "", "");
    installation::InstallationRepository removedRepository(removedDb);
    installation::InstallationService removed(removedRepository, installationToken, removedAuth.hasEnvironmentCredentials(), limiter_);
    removed.initializeLegacy();
    EXPECT_TRUE(removed.status()["installed"].asBool());
    EXPECT_FALSE(removed.status()["installation_enabled"].asBool());
    expectPublicShape(removed.status());
    expectApiError([&] { removed.install(installationToken, input()); }, 409, "ALREADY_INSTALLED");
    expectApiError([&] { removedAuth.login("legacy-admin", "integration-only-password"); }, 503, "ADMIN_DISABLED");
    expectApiError([&] { removedAuth.require("Bearer " + session); }, 401, "UNAUTHORIZED");
}
TEST_F(InstallationPostgres, EnvironmentOverrideAndDatabaseChangesInvalidateCredentialIdentity) {
    installation::InstallationRepository repository(db_);
    installation::InstallationService service(repository, installationToken, false, limiter_);
    service.install(installationToken, input());
    auth::AuthRepository authRepository(db_);
    auth::AuthService databaseAuth(authRepository, "", "");
    const auto token = databaseAuth.login("installed-admin", "installation-only-password");
    auth::AuthService overrideAuth(authRepository, "emergency-admin", legacyHash);
    expectApiError([&] { overrideAuth.require("Bearer " + token); }, 401, "UNAUTHORIZED");
    expectApiError([&] { overrideAuth.login("installed-admin", "installation-only-password"); }, 401, "INVALID_CREDENTIALS");
    installation::InstallationService overrideInstallation(repository, installationToken, true, limiter_);
    const auto before = service.status();
    overrideInstallation.initializeLegacy();
    EXPECT_EQ(overrideInstallation.status(), before);
    EXPECT_EQ(db_->execSqlSync("SELECT auth_source FROM site_installation")[0][0].as<std::string>(), "database");
    const auto overrideToken = overrideAuth.login("emergency-admin", "integration-only-password");
    EXPECT_EQ(overrideAuth.require("Bearer " + overrideToken), "emergency-admin");
    expectApiError([&] { databaseAuth.require("Bearer " + overrideToken); }, 401, "UNAUTHORIZED");
    // Partial env credentials must not mask the installed DB account.
    auth::AuthService partial(authRepository, "unused-environment-user", "");
    const auto restoredToken = partial.login("installed-admin", "installation-only-password");
    EXPECT_EQ(databaseAuth.require("Bearer " + restoredToken), "installed-admin");
    db_->execSqlSync("UPDATE site_installation SET username='renamed-admin'");
    expectApiError([&] { databaseAuth.require("Bearer " + restoredToken); }, 401, "UNAUTHORIZED");
    const auto renamedToken = databaseAuth.login("renamed-admin", "installation-only-password");
    db_->execSqlSync("UPDATE site_installation SET password_hash=$1", legacyHash);
    expectApiError([&] { databaseAuth.require("Bearer " + renamedToken); }, 401, "UNAUTHORIZED");
    expectApiError([&] { databaseAuth.login("renamed-admin", "installation-only-password"); }, 401, "INVALID_CREDENTIALS");
    EXPECT_NO_THROW(databaseAuth.login("renamed-admin", "integration-only-password"));
}
TEST_F(InstallationPostgres, ReadinessRequiresLedgerAndQueryableTableAndStatusPropagatesFailure) {
    EXPECT_NO_THROW(requireDatabaseReady(db_));
    db_->execSqlSync("DELETE FROM schema_migrations WHERE version='005_site_installation.sql'");
    expectApiError([&] { requireDatabaseReady(db_); }, 503, "DATABASE_NOT_READY");
    db_->execSqlSync("INSERT INTO schema_migrations VALUES('005_site_installation.sql')");
    EXPECT_NO_THROW(requireDatabaseReady(db_));
    installation::InstallationRepository repository(db_);
    installation::InstallationService service(repository, installationToken, false, limiter_);
    installation::InstallationService legacy(repository, installationToken, true, limiter_);
    db_->execSqlSync("ALTER TABLE site_installation RENAME TO unavailable_installation");
    // These DB exceptions map to 503 DATABASE_UNAVAILABLE in ApiController::dispatch, never installed=false.
    EXPECT_THROW(service.status(), drogon::orm::DrogonDbException);
    EXPECT_THROW(legacy.status(), drogon::orm::DrogonDbException);
    EXPECT_THROW(requireDatabaseReady(db_), drogon::orm::DrogonDbException);
}
}  // namespace
