#include <gtest/gtest.h>
#include <cstdlib>
#include "midi/PostgresMidiRepository.h"
#include "person/PostgresPersonRepository.h"
#include "recovery/PostgresRecoveryRepository.h"
#include "midi/MidiService.h"
#include "common/Json.h"

using namespace lostmidi;

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
