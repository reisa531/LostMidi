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
#include "recovery/RecoveryWriteService.h"
#include "person/PersonWriteService.h"
#include <future>

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
    // Shadow both tables: disabled-auth checks must not pick up a real installed administrator.
    transaction->execSqlSync("CREATE TEMP TABLE admin_sessions (LIKE public.admin_sessions INCLUDING ALL) ON COMMIT DROP");
    transaction->execSqlSync("CREATE TEMP TABLE site_installation (LIKE public.site_installation INCLUDING ALL) ON COMMIT DROP");
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

TEST(PostgresIntegration, RecoveryCrudRollbackAndSharedRevision) {
    const char* url = std::getenv("LOSTMIDI_TEST_DATABASE_URL");
    if (!url || !*url) GTEST_SKIP() << "Set LOSTMIDI_TEST_DATABASE_URL to a migrated disposable test database.";
    auto db = drogon::orm::DbClient::newPgClient(url, 4);
    db->setTimeout(5.0);
    const auto slug = "repository-test-" + auth::randomToken();
    struct Cleanup {
        drogon::orm::DbClientPtr db; std::string slug;
        ~Cleanup() { try { db->execSqlSync("DELETE FROM midi_entries WHERE slug=$1 OR slug=$2", slug, slug + "-other"); } catch (...) {} }
    } cleanup{db, slug};
    midi::PostgresMidiRepository midis(db); midi::MidiWriteService midiWriter(midis);
    recovery::PostgresRecoveryRepository repository(db); recovery::RecoveryWriteService service(repository);
    person::PostgresPersonRepository people(db); person::PersonWriteService credits(people);
    auto id = db->execSqlSync("INSERT INTO midi_entries(slug,title) VALUES($1,'Recovery test') RETURNING id", slug)[0]["id"].as<std::int64_t>();
    auto other = db->execSqlSync("INSERT INTO midi_entries(slug,title) VALUES($1,'Other') RETURNING id", slug + "-other")[0]["id"].as<std::int64_t>();
    recovery::HistoricalSource source; source.websiteName = "Historical site";
    source.originalUrl = "https://example.org/music.mid"; source.firstSeenAt = "1999-12-31T23:59:59.123456Z";
    auto saved = service.saveSource(id, 0, 1, source);
    ASSERT_GT(saved.source.id, 0); EXPECT_EQ(saved.revision, 2);
    EXPECT_EQ(saved.source.firstSeenAt, source.firstSeenAt);
    source.notes = "Edited";
    auto edited = service.saveSource(id, saved.source.id, 2, source);
    EXPECT_EQ(edited.source.id, saved.source.id); EXPECT_EQ(edited.revision, 3);
    expectApiError([&] { service.saveSource(id, 0, 2, source); }, 409, "STALE_ENTRY");
    expectApiError([&] { service.saveSource(other, saved.source.id, 1, source); }, 404, "SOURCE_NOT_FOUND");
    expectApiError([&] { service.deleteSource(other, saved.source.id, 1); }, 404, "SOURCE_NOT_FOUND");
    EXPECT_EQ(service.getHistory(other).revision, 1);
    recovery::RecoveryEvent event; event.story = "Date unknown";
    auto recovered = service.saveEvent(id, 0, 3, event);
    EXPECT_EQ(recovered.revision, 4); EXPECT_FALSE(recovered.event.recoveredAt);
    ASSERT_FALSE(recovered.event.createdAt.empty());
    event.story = "Updated story"; event.recoveredAt = "2000-02-29T01:02:03.123456Z";
    auto changed = service.saveEvent(id, recovered.event.id, 4, event);
    EXPECT_EQ(changed.event.id, recovered.event.id); EXPECT_EQ(changed.event.createdAt, recovered.event.createdAt);
    EXPECT_EQ(changed.event.recoveredAt, event.recoveredAt);
    event.recoveredBy = 9223372036854775807LL;
    expectApiError([&] { service.saveEvent(id, recovered.event.id, 5, event); }, 400, "UNKNOWN_PERSON");
    EXPECT_EQ(service.getHistory(id).revision, 5);
    EXPECT_EQ(service.getHistory(id).history.events[0].story, "Updated story");
    event.recoveredBy.reset();
    expectApiError([&] { service.saveEvent(other, recovered.event.id, 1, event); }, 404, "RECOVERY_EVENT_NOT_FOUND");
    expectApiError([&] { service.deleteEvent(other, recovered.event.id, 1); }, 404, "RECOVERY_EVENT_NOT_FOUND");
    EXPECT_EQ(service.getHistory(other).revision, 1);
    EXPECT_EQ(midis.findById(id)->archiveStatus, "uncertain");
    EXPECT_TRUE(people.creditsFor(id).empty());
    auto creditResult = credits.saveCredits(id, {5, {}});
    EXPECT_EQ(creditResult.revision, 6);
    expectApiError([&] { service.deleteSource(id, saved.source.id, 5); }, 409, "STALE_ENTRY");
    auto entry = *midis.findById(id); entry.title = "New title";
    EXPECT_EQ(midiWriter.update(id, entry).revision, 7);
    expectApiError([&] { service.saveEvent(id, 0, 6, event); }, 409, "STALE_ENTRY");
    // Both writes use one revision; the parent lock permits exactly one commit.
    auto write = [&] {
        try { service.saveSource(id, 0, 7, source); return 200; }
        catch (const ApiError& error) { return error.status; }
    };
    auto a = std::async(std::launch::async, write);
    auto b = std::async(std::launch::async, write);
    const int first = a.get(), second = b.get();
    EXPECT_TRUE((first == 200 && second == 409) || (first == 409 && second == 200));
    auto current = service.getHistory(id);
    EXPECT_EQ(current.revision, 8); ASSERT_EQ(current.history.sources.size(), 2u);
    EXPECT_EQ(repository.eventsFor(id)[0].createdAt, recovered.event.createdAt);
    auto removed = service.deleteSource(id, saved.source.id, 8);
    EXPECT_EQ(removed.deletedId, saved.source.id); EXPECT_EQ(removed.revision, 9);
    expectApiError([&] { service.deleteSource(id, saved.source.id, 9); }, 404, "SOURCE_NOT_FOUND");
    EXPECT_EQ(service.getHistory(id).revision, 9);
    EXPECT_EQ(service.deleteEvent(id, recovered.event.id, 9).revision, 10);
    EXPECT_TRUE(repository.eventsFor(id).empty());
    // Bypass service validation to force a real SQL CHECK failure after the revision update.
    auto invalidSource = source;
    invalidSource.firstSeenAt = "2001-01-01T00:00:00Z";
    invalidSource.lastSeenAt = "2000-01-01T00:00:00Z";
    EXPECT_ANY_THROW(repository.saveSource(id, 0, 10, invalidSource));
    EXPECT_EQ(service.getHistory(id).revision, 10);
    EXPECT_EQ(service.getHistory(id).history.sources.size(), 1u);
    expectApiError([&] { service.getHistory(9223372036854775807LL); }, 404, "MIDI_NOT_FOUND");
}

TEST(PostgresIntegration, SoftDeleteProtectsReferencesAndRetainsMetadata) {
    const char* url = std::getenv("LOSTMIDI_TEST_DATABASE_URL");
    if (!url || !*url) GTEST_SKIP() << "Set LOSTMIDI_TEST_DATABASE_URL to a disposable migrated database.";
    auto db = drogon::orm::DbClient::newPgClient(url, 4);
    const auto slug = "delete-test-" + auth::randomToken();
    midi::PostgresMidiRepository midis(db); person::PostgresPersonRepository people(db);
    const auto id = db->execSqlSync("INSERT INTO midi_entries(slug,title) VALUES($1,'Delete test') RETURNING id", slug)[0][0].as<std::int64_t>();
    const auto person = db->execSqlSync("INSERT INTO people(display_name) VALUES($1) RETURNING id", slug)[0][0].as<std::int64_t>();
    struct Cleanup {
        drogon::orm::DbClientPtr db; std::int64_t id, person;
        ~Cleanup() { try {
            db->execSqlSync("DELETE FROM admin_audit_log WHERE (entity_type='midi' AND entity_id=$1) OR (entity_type='person' AND entity_id=$2)", id, person);
            db->execSqlSync("DELETE FROM midi_entries WHERE id=$1", id);
            db->execSqlSync("DELETE FROM people WHERE id=$1", person);
        } catch (...) {} }
    } cleanup{db, id, person};
    db->execSqlSync("INSERT INTO person_aliases(person_id,alias) VALUES($1,'Old name')", person);
    db->execSqlSync("INSERT INTO midi_credits(midi_id,person_id,role) VALUES($1,$2,'composer')", id, person);
    expectApiError([&] { people.remove(person, 2, "test-admin"); }, 409, "STALE_PERSON");
    expectApiError([&] { people.remove(person, 1, "test-admin"); }, 409, "PERSON_IN_USE");
    db->execSqlSync("DELETE FROM midi_credits WHERE midi_id=$1", id);
    db->execSqlSync("INSERT INTO recovery_events(midi_id,recovered_by,story) VALUES($1,$2,'History')", id, person);
    expectApiError([&] { people.remove(person, 1, "test-admin"); }, 409, "PERSON_IN_USE");
    EXPECT_EQ(db->execSqlSync("SELECT recovered_by FROM recovery_events WHERE midi_id=$1", id)[0][0].as<std::int64_t>(), person);
    db->execSqlSync("INSERT INTO midi_credits(midi_id,person_id,role) VALUES($1,$2,'composer')", id, person);
    db->execSqlSync("INSERT INTO historical_sources(midi_id,website_name) VALUES($1,'History')", id);
    auto edit = *midis.findById(id); edit.title = "Edited"; midis.update(id, edit);
    expectApiError([&] { midis.remove(id, 1, "test-admin"); }, 409, "STALE_ENTRY");
    EXPECT_EQ(people.creditsFor(id).size(), 1u);
    auto remove = [&] { try { midis.remove(id, 2, "test-admin"); return 200; } catch (const ApiError& e) { return e.status; } };
    auto a = std::async(std::launch::async, remove), b = std::async(std::launch::async, remove);
    const auto first = a.get(), second = b.get();
    EXPECT_TRUE((first == 200 && second == 404) || (first == 404 && second == 200));
    EXPECT_FALSE(midis.findById(id)); EXPECT_TRUE(people.findById(person));
    EXPECT_TRUE(people.midisFor(person).empty());
    for (const auto* table : {"midi_credits", "historical_sources", "recovery_events"})
        EXPECT_EQ(db->execSqlSync(std::string("SELECT 1 FROM ") + table + " WHERE midi_id=$1", id).size(), 1u);
    const auto audit = db->execSqlSync("SELECT actor,action,entity_label FROM admin_audit_log WHERE entity_type='midi' AND entity_id=$1", id);
    ASSERT_EQ(audit.size(), 1u);
    EXPECT_EQ(audit[0]["actor"].as<std::string>(), "test-admin");
    EXPECT_EQ(audit[0]["action"].as<std::string>(), "delete");
    EXPECT_EQ(audit[0]["entity_label"].as<std::string>(), "Edited");
    expectApiError([&] { people.remove(person, 1, "test-admin"); }, 409, "PERSON_IN_USE");
    db->execSqlSync("DELETE FROM midi_credits WHERE midi_id=$1", id);
    db->execSqlSync("UPDATE recovery_events SET recovered_by=NULL WHERE midi_id=$1", id);
    people.remove(person, 1, "test-admin");
    EXPECT_EQ(people.aliasesFor(person), std::vector<std::string>{"Old name"});
    EXPECT_FALSE(people.findById(person));
    EXPECT_EQ(db->execSqlSync("SELECT revision FROM people WHERE id=$1", person)[0][0].as<std::int64_t>(), 2);
    EXPECT_EQ(db->execSqlSync("SELECT actor FROM admin_audit_log WHERE entity_type='person' AND entity_id=$1", person)[0][0].as<std::string>(), "test-admin");
    expectApiError([&] { people.remove(person, 1, "test-admin"); }, 404, "PERSON_NOT_FOUND");
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
