#include <gtest/gtest.h>
#include <cstdlib>
#include "midi/PostgresMidiRepository.h"
#include "person/PostgresPersonRepository.h"
#include "recovery/PostgresRecoveryRepository.h"
#include "midi/MidiService.h"
#include "common/Json.h"
#include "auth/AuthService.h"
#include "auth/Password.h"
#include "midi/MidiWriteService.h"

using namespace lostmidi;

namespace {
template<class Work> void expectApiError(Work work, int status, const std::string& code) {
    try { work(); FAIL() << "Expected API error " << code; }
    catch (const ApiError& error) { EXPECT_EQ(error.status, status); EXPECT_EQ(error.code, code); }
}
struct Rollback {
    std::shared_ptr<drogon::orm::Transaction> transaction;
    ~Rollback() { transaction->rollback(); }
};
}

TEST(PostgresIntegration, AdministratorSessionLifecycle) {
    const char* url = std::getenv("LOSTMIDI_TEST_DATABASE_URL");
    if (!url || !*url) GTEST_SKIP() << "Set LOSTMIDI_TEST_DATABASE_URL to a migrated test database.";
    auto db = drogon::orm::DbClient::newPgClient(url, 1);
    db->setTimeout(5.0);
    auto transaction = db->newTransaction();
    Rollback cleanup{transaction};
    // Shadow the real table so credential cleanup never affects other sessions.
    transaction->execSqlSync("CREATE TEMP TABLE admin_sessions (LIKE public.admin_sessions INCLUDING ALL) ON COMMIT DROP");
    auth::AuthRepository repository(transaction);
    // Public test fixture only; never used as a deployment default.
    const std::string hash = "pbkdf2_sha256:600000:00000000000000000000000000000000:73cce23bed8110946640df7fee25f986fdd0ec35066980f5cfa99f6905bcbeb0";
    auth::AuthService service(repository, "test-admin", hash);
    expectApiError([&] { service.login("wrong-user", "integration-only-password"); }, 401, "INVALID_CREDENTIALS");
    const auto token = service.login("test-admin", "integration-only-password");
    EXPECT_EQ(service.require("Bearer " + token), "test-admin");
    const auto stored = transaction->execSqlSync("SELECT token_hash FROM admin_sessions");
    ASSERT_EQ(stored.size(), 1u);
    EXPECT_EQ(stored[0]["token_hash"].as<std::string>(), auth::digest(token));
    EXPECT_NE(stored[0]["token_hash"].as<std::string>(), token);
    auth::AuthService rotated(repository, "renamed-admin", hash);
    expectApiError([&] { rotated.require("Bearer " + token); }, 401, "UNAUTHORIZED");
    transaction->execSqlSync("UPDATE admin_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'");
    expectApiError([&] { service.require("Bearer " + token); }, 401, "UNAUTHORIZED");
    const auto second = service.login("test-admin", "integration-only-password");
    EXPECT_EQ(service.require("Bearer " + second), "test-admin");
    service.logout("Bearer " + second);
    expectApiError([&] { service.require("Bearer " + second); }, 401, "UNAUTHORIZED");
    EXPECT_TRUE(transaction->execSqlSync("SELECT 1 FROM admin_sessions").empty());
    expectApiError([&] { service.require("Bearer invalid"); }, 401, "UNAUTHORIZED");
    for (int attempt = 3; attempt < 10; ++attempt)
        expectApiError([&] { service.login("test-admin", ""); }, 401, "INVALID_CREDENTIALS");
    expectApiError([&] { service.login("test-admin", ""); }, 429, "LOGIN_RATE_LIMITED");
    auth::AuthService disabled(repository, "test-admin", "");
    expectApiError([&] { disabled.login("test-admin", "anything"); }, 503, "ADMIN_DISABLED");
}

TEST(PostgresIntegration, ArchiveWriteConflictsPreserveStoredData) {
    const char* url = std::getenv("LOSTMIDI_TEST_DATABASE_URL");
    if (!url || !*url) GTEST_SKIP() << "Set LOSTMIDI_TEST_DATABASE_URL to a migrated test database.";
    auto db = drogon::orm::DbClient::newPgClient(url, 1);
    db->setTimeout(5.0);
    const std::string slug = "repository-test-" + auth::randomToken();
    struct Cleanup {
        drogon::orm::DbClientPtr db; std::string slug;
        ~Cleanup() { try { db->execSqlSync("DELETE FROM midi_entries WHERE slug=$1 OR slug=$2", slug, slug + "-second"); } catch (...) {} }
    } cleanup{db, slug};
    midi::PostgresMidiRepository repository(db);
    midi::MidiWriteService service(repository);
    midi::MidiEntry draft;
    draft.title = "Integration archive"; draft.slug = slug; draft.archiveStatus = "uncertain";
    draft.copyrightStatus = "unknown"; draft.distributionPermission = "metadata_only";
    const auto created = service.create(draft);
    EXPECT_EQ(created.revision, 1);
    expectApiError([&] { service.create(draft); }, 409, "SLUG_CONFLICT");
    draft.title = "Edited archive"; draft.estimatedYear = 1999; draft.revision = created.revision;
    const auto edited = service.update(created.id, draft);
    EXPECT_EQ(edited.revision, created.revision + 1);
    EXPECT_EQ(edited.estimatedYear, 1999);
    expectApiError([&] { service.update(created.id, draft); }, 409, "STALE_ENTRY");
    auto secondDraft = draft; secondDraft.slug = slug + "-second";
    service.create(secondDraft);
    draft.slug = secondDraft.slug; draft.revision = edited.revision;
    expectApiError([&] { service.update(created.id, draft); }, 409, "SLUG_CONFLICT");
    const auto retained = service.get(created.id);
    EXPECT_EQ(retained.slug, slug); EXPECT_EQ(retained.title, edited.title); EXPECT_EQ(retained.revision, edited.revision);
    expectApiError([&] { service.update(9223372036854775807LL, draft); }, 404, "MIDI_NOT_FOUND");
}

TEST(PostgresIntegration, SeededArchiveRoundTrip) {
    const char* url = std::getenv("LOSTMIDI_TEST_DATABASE_URL");
    if (!url || !*url) GTEST_SKIP() << "Set LOSTMIDI_TEST_DATABASE_URL to a migrated demo test database.";
    auto db = drogon::orm::DbClient::newPgClient(url, 2);
    db->setTimeout(5.0);
    midi::PostgresMidiRepository midis(db);
    person::PostgresPersonRepository people(db);
    recovery::PostgresRecoveryRepository recoveries(db);
    recovery::RecoveryService history(recoveries);
    midi::MidiService service(midis, people, history);
    const auto detail = service.getBySlug("example-midi");
    EXPECT_EQ(detail.entry.title, "Paper Observatory (fictional)");
    ASSERT_FALSE(detail.credits.empty());
    ASSERT_FALSE(detail.history.sources.empty());
    ASSERT_FALSE(detail.history.events.empty());
    const auto creator = people.findById(detail.credits.front().personId);
    ASSERT_TRUE(creator);
    EXPECT_EQ(creator->displayName, detail.credits.front().displayName);
    EXPECT_FALSE(people.aliasesFor(creator->id).empty());
    EXPECT_FALSE(people.midisFor(creator->id).empty());
    EXPECT_FALSE(midis.findBySlug("not-present"));
    EXPECT_FALSE(midis.findBySha256(std::string(64, '0')));
    EXPECT_GE(midis.count(), 3);
    const auto first = service.list({1, 1});
    const auto second = service.list({2, 1});
    ASSERT_EQ(first.data.size(), 1u);
    ASSERT_EQ(second.data.size(), 1u);
    EXPECT_NE(first.data[0].entry.id, second.data[0].entry.id);
    EXPECT_TRUE(service.list({1000000, 1}).data.empty());
    const auto json = toJson(detail);
    EXPECT_TRUE(json["entry"]["id"].isString());
    EXPECT_TRUE(json["files"].isArray());
    EXPECT_TRUE(json["historical_sources"].isArray());
}
