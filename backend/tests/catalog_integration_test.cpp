#include <gtest/gtest.h>
#include "catalog/CatalogService.h"
#include "catalog/PostgresCatalogRepository.h"
#include "catalog/Json.h"
#include "auth/Password.h"
#include "midi/Models.h"
#include <algorithm>
#include <cstdlib>
#include <functional>
#include <limits>
#include <memory>
#include <set>

using namespace lostmidi;
namespace {
template<class Work> void badRequest(Work work) {
    try { work(); FAIL() << "Expected HTTP 400"; }
    catch (const ApiError& error) { EXPECT_EQ(error.status, 400); }
}
std::vector<std::int64_t> ids(const catalog::PageResult<catalog::CatalogEntry>& page) {
    std::vector<std::int64_t> result;
    for (const auto& entry : page.data) result.push_back(entry.id);
    return result;
}
std::set<std::string> keys(const Json::Value& json) {
    const auto names = json.getMemberNames();
    return {names.begin(), names.end()};
}
void publicOnly(const Json::Value& json) {
    if (json.isObject()) {
        for (const auto& name : json.getMemberNames()) {
            EXPECT_FALSE(name == "storage_key" || name == "sha256" || name == "private_archive_confirmed" ||
                name == "public_distribution_confirmed" || name == "distribution_permission" || name == "rights_holder" ||
                name == "original_url" || name == "wayback_url" || name == "notes" || name == "description" ||
                name == "password_hash" || name == "token_hash" || name == "auth_source") << name;
            publicOnly(json[name]);
        }
    } else if (json.isArray()) {
        for (const auto& item : json) publicOnly(item);
    }
}
class FakeCatalog : public catalog::ICatalogRepository {
public:
    int calls = 0;
    catalog::Overview overview() override { ++calls; return {}; }
    catalog::PageResult<catalog::CatalogEntry> entries(const catalog::EntryQuery&) override { ++calls; return {}; }
    catalog::PageResult<catalog::Person> people(Page) override { ++calls; return {}; }
    catalog::PageResult<catalog::Group> groups(const catalog::GroupQuery&) override { ++calls; return {}; }
};

TEST(CatalogContract, DefaultsAndUnassignedFilterContract) {
    const auto entries = catalog::parseEntryQuery({});
    EXPECT_EQ(entries.page.number, 1); EXPECT_EQ(entries.page.size, 20); EXPECT_EQ(entries.sort, "updated");
    EXPECT_FALSE(entries.status); EXPECT_FALSE(entries.personId); EXPECT_FALSE(entries.source);
    EXPECT_FALSE(entries.missingAuthor); EXPECT_FALSE(entries.missingSource);
    const auto groups = catalog::parseGroupQuery({});
    EXPECT_EQ(groups.by, "author"); EXPECT_EQ(groups.page.number, 1); EXPECT_EQ(groups.page.size, 30);
    EXPECT_EQ(catalog::parsePeoplePage({}).size, 20);
    const auto literal = catalog::parseEntryQuery({{"source", "none"}});
    EXPECT_EQ(literal.source, "none"); EXPECT_FALSE(literal.missingSource);
    EXPECT_TRUE(catalog::parseEntryQuery({{"missing", "source"}}).missingSource);
    EXPECT_TRUE(catalog::parseEntryQuery({{"missing", "author"}}).missingAuthor);
    const auto both = catalog::parseEntryQuery({{"person", "none"}, {"missing", "source"}});
    EXPECT_TRUE(both.missingAuthor); EXPECT_TRUE(both.missingSource);
    const auto maximum = catalog::parseEntryQuery({{"person", "9223372036854775807"}, {"page", "1000000"}, {"pageSize", "100"}});
    EXPECT_EQ(maximum.personId, (std::numeric_limits<std::int64_t>::max)());
    EXPECT_EQ(maximum.page.offset(), 99999900);
}
TEST(CatalogContract, InvalidHttpParametersAreBadRequests) {
    for (const auto* page : {"", "0", "-1", "1000001", "2147483648", "1.0", "1x", "+1", " 1"}) {
        badRequest([&] { catalog::parseEntryQuery({{"page", page}}); });
        badRequest([&] { catalog::parsePeoplePage({{"page", page}}); });
        badRequest([&] { catalog::parseGroupQuery({{"page", page}}); });
    }
    for (const auto* size : {"", "0", "-1", "101", "99999999999999999999", "20x"}) {
        badRequest([&] { catalog::parseEntryQuery({{"pageSize", size}}); });
        badRequest([&] { catalog::parsePeoplePage({{"pageSize", size}}); });
        badRequest([&] { catalog::parseGroupQuery({{"pageSize", size}}); });
    }
    for (const auto* value : {"", "0", "-1", "+1", "1x", "1.0", "9223372036854775808", "NONE", "1 OR 1=1"})
        badRequest([&] { catalog::parseEntryQuery({{"person", value}}); });
    for (const auto* value : {"", "LOST", "recovered", "lost' OR true--"})
        badRequest([&] { catalog::parseEntryQuery({{"status", value}}); });
    for (const auto* value : {"", "id", "updated DESC", "title; DROP TABLE people"})
        badRequest([&] { catalog::parseEntryQuery({{"sort", value}}); });
    for (const auto* value : {"", "people", "AUTHOR", "author; SELECT 1"})
        badRequest([&] { catalog::parseGroupQuery({{"by", value}}); });
    for (const auto* value : {"", "both", "none", "Author"})
        badRequest([&] { catalog::parseEntryQuery({{"missing", value}}); });
    for (const auto* status : {"archived", "partially_recovered", "lost", "uncertain"})
        EXPECT_NO_THROW(catalog::parseEntryQuery({{"status", status}}));
}
TEST(CatalogContract, SourceValidationIsExactUtf8AndByteBounded) {
    for (const auto& value : std::vector<std::string>{"", std::string(501, 'a'), std::string("a\0b", 3),
        std::string("\xc0\xaf", 2), std::string("\xed\xa0\x80", 3), std::string("\xf4\x90\x80\x80", 4),
        std::string("\xe4\xb8", 2), std::string("\x80", 1), std::string(498, 'a') + "乐"})
        badRequest([&] { catalog::parseEntryQuery({{"source", value}}); });
    for (const auto& value : std::vector<std::string>{std::string(500, 'a'), std::string(497, 'a') + "乐", " 日本 MIDI ", "a'b", "none"})
        EXPECT_EQ(catalog::parseEntryQuery({{"source", value}}).source, value);
}
TEST(CatalogContract, ServiceRejectsInvalidTypedQueriesBeforeRepositoryAccess) {
    FakeCatalog repository;
    catalog::CatalogService service(repository);
    catalog::EntryQuery query;
    query.page.size = 101; badRequest([&] { service.entries(query); });
    query = {}; query.status = "invalid"; badRequest([&] { service.entries(query); });
    query = {}; query.personId = 0; badRequest([&] { service.entries(query); });
    query = {}; query.source = ""; badRequest([&] { service.entries(query); });
    query = {}; query.sort = "id"; badRequest([&] { service.entries(query); });
    badRequest([&] { service.people({0, 20}); });
    badRequest([&] { service.groups({{1, 30}, "url"}); });
    EXPECT_EQ(repository.calls, 0);
}
TEST(CatalogContract, JsonHasOnlyThePublicContractAndStringIds) {
    catalog::CatalogEntry entry;
    entry.id = 9007199254740993LL;
    entry.credits.push_back({9007199254740995LL, "Author", "composer"});
    const auto json = catalog::toJson(entry);
    EXPECT_EQ(keys(json), (std::set<std::string>{"id", "slug", "title", "estimated_year", "archive_status", "updated_at", "credits", "sources", "file_count", "downloadable_file_count"}));
    EXPECT_EQ(json["id"].asString(), "9007199254740993"); EXPECT_TRUE(json["estimated_year"].isNull());
    EXPECT_EQ(json["credits"][0]["person_id"].asString(), "9007199254740995");
    EXPECT_EQ(keys(json["credits"][0]), (std::set<std::string>{"person_id", "display_name", "role"}));
    EXPECT_TRUE(json["sources"].isArray()); publicOnly(json);
    catalog::Person person; person.id = entry.id;
    const auto personJson = catalog::toJson(person);
    EXPECT_EQ(keys(personJson), (std::set<std::string>{"id", "display_name", "biography", "aliases", "midi_count"}));
    EXPECT_TRUE(personJson["biography"].isNull()); EXPECT_TRUE(personJson["aliases"].isArray());
    EXPECT_EQ(personJson["id"].asString(), "9007199254740993");
    const auto group = catalog::toJson(catalog::Group{"", "未署名", 2, 1, 0});
    EXPECT_EQ(keys(group), (std::set<std::string>{"key", "label", "entries", "with_files", "downloadable"}));
    EXPECT_EQ(group["key"].asString(), "");
}

class CatalogPostgres : public ::testing::Test {
protected:
    drogon::orm::DbClientPtr owner, db;
    std::unique_ptr<catalog::PostgresCatalogRepository> repository;
    std::unique_ptr<catalog::CatalogService> service;
    std::vector<std::string> queries;
    std::function<void(std::string_view)> queryHook;
    std::string schema;
    bool created = false;
    void SetUp() override {
        const char* url = std::getenv("LOSTMIDI_TEST_DATABASE_URL");
        if (!url || !*url) GTEST_SKIP() << "Set LOSTMIDI_TEST_DATABASE_URL to a disposable database migrated through 006.";
        owner = drogon::orm::DbClient::newPgClient(url, 1); owner->setTimeout(10.0);
        schema = "catalog_test_" + auth::randomToken().substr(0, 24);
        owner->execSqlSync("CREATE SCHEMA " + schema); created = true;
        // Copy structure only, never production rows. Identity sequences are local
        // to this schema; search_path deliberately excludes public for all queries.
        for (const auto* table : {"midi_entries", "people", "person_aliases", "midi_credits", "historical_sources", "midi_files"})
            owner->execSqlSync("CREATE TABLE " + schema + "." + table + " (LIKE public." + table + " INCLUDING ALL)");
        std::string connection = url;
        if (connection.starts_with("postgres://") || connection.starts_with("postgresql://"))
            connection += (connection.find('?') == std::string::npos ? "?" : "&") + std::string("options=-csearch_path%3D") + schema;
        else connection += " options='-csearch_path=" + schema + "'";
        db = drogon::orm::DbClient::newPgClient(connection, 3); db->setTimeout(10.0);
        db->execSqlSync("ALTER TABLE midi_credits ADD FOREIGN KEY(midi_id) REFERENCES midi_entries(id), ADD FOREIGN KEY(person_id) REFERENCES people(id)");
        db->execSqlSync("ALTER TABLE historical_sources ADD FOREIGN KEY(midi_id) REFERENCES midi_entries(id)");
        db->execSqlSync("ALTER TABLE midi_files ADD FOREIGN KEY(midi_id) REFERENCES midi_entries(id)");
        db->execSqlSync("ALTER TABLE person_aliases ADD FOREIGN KEY(person_id) REFERENCES people(id)");
        repository = std::make_unique<catalog::PostgresCatalogRepository>(db, [this](std::string_view sql) {
            queries.emplace_back(sql);
            if (queryHook) queryHook(sql);
        });
        service = std::make_unique<catalog::CatalogService>(*repository);
    }
    void TearDown() override {
        service.reset(); repository.reset(); db.reset();
        if (created) {
            try { owner->execSqlSync("DROP SCHEMA " + schema + " CASCADE"); }
            catch (...) { ADD_FAILURE() << "Could not remove isolated catalog schema."; }
        }
    }
    void seed() {
        db->execSqlSync("INSERT INTO people(id,display_name,biography) VALUES(11,'Alice','Biography'),(12,'Alice',NULL),(13,'Bob',NULL)");
        db->execSqlSync("INSERT INTO person_aliases(person_id,alias) VALUES(11,'Zed'),(11,'Ace'),(12,'Other'),(13,'Unused')");
        db->execSqlSync(
            "INSERT INTO midi_entries(id,slug,title,archive_status,distribution_permission,estimated_year,updated_at,description) VALUES"
            "(1,'alpha','Alpha','archived','unknown',1999,'2020-01-01T00:00:00Z','Private-sized detail'),"
            "(2,'beta','Beta','lost','unknown',NULL,'2020-01-02T00:00:00Z',NULL),"
            "(3,'same-one','Same','partially_recovered','restricted',NULL,'2020-01-03T00:00:00Z',NULL),"
            "(4,'same-two','Same','uncertain','metadata_only',NULL,'2020-01-04T00:00:00Z',NULL),"
            "(5,'echo','Echo','archived','permission_granted',NULL,'2020-01-05T00:00:00Z',NULL),"
            "(6,'foxtrot','Foxtrot','lost','unknown',NULL,'2020-01-06T00:00:00Z',NULL),"
            "(7,'zulu-one','Zulu','uncertain','unknown',NULL,'2020-01-07T00:00:00Z',NULL),"
            "(8,'zulu-two','Zulu','lost','unknown',NULL,'2020-01-07T00:00:00Z',NULL)");
        db->execSqlSync("INSERT INTO midi_credits(midi_id,person_id,role) VALUES"
            "(1,11,'composer'),(1,11,'sequencer'),(1,12,'arranger'),(2,11,'contributor'),(3,12,'sequencer'),(5,11,'composer')");
        db->execSqlSync("INSERT INTO historical_sources(midi_id,website_name,original_url,notes) VALUES"
            "(1,'Archive','https://example.org/a','Do not expose'),(1,'Archive','https://example.org/b',NULL),"
            "(1,'Second',NULL,NULL),(2,'Archive',NULL,NULL),(3,'none',NULL,NULL),(5,'Second',NULL,NULL)");
        db->execSqlSync("INSERT INTO midi_files(id,midi_id,original_filename,sha256,storage_key,file_size,private_archive_confirmed) "
            "SELECT id,midi_id,'fixture.mid',lpad(id::text,64,'0'),'secret-key-'||id,42,confirmed "
            "FROM (VALUES(1,1,true),(2,1,true),(3,1,false),(4,2,false),(5,3,true),(6,4,true),(7,5,true)) f(id,midi_id,confirmed)");
    }
    catalog::PageResult<catalog::CatalogEntry> entries(catalog::QueryParameters parameters = {}) {
        return service->entries(catalog::parseEntryQuery(parameters));
    }
    catalog::PageResult<catalog::Group> groups(const std::string& by) {
        return service->groups(catalog::parseGroupQuery({{"by", by}}));
    }
};

TEST_F(CatalogPostgres, EmptyCatalogAndUncreditedPeopleDoNotCreateSyntheticGroups) {
    const auto overview = catalog::toJson(service->overview());
    EXPECT_EQ(keys(overview), (std::set<std::string>{"stats", "recent", "needs_attention"}));
    EXPECT_EQ(keys(overview["stats"]), (std::set<std::string>{"entries", "people", "files", "with_files", "downloadable", "sources", "statuses"}));
    for (const auto* key : {"entries", "people", "files", "with_files", "downloadable", "sources"}) EXPECT_EQ(overview["stats"][key].asInt64(), 0);
    for (const auto* key : {"archived", "partially_recovered", "lost", "uncertain"}) EXPECT_EQ(overview["stats"]["statuses"][key].asInt64(), 0);
    EXPECT_TRUE(overview["recent"].isArray()); EXPECT_TRUE(overview["recent"].empty());
    EXPECT_TRUE(overview["needs_attention"].isArray()); EXPECT_TRUE(overview["needs_attention"].empty());
    const auto page = catalog::toJson(entries());
    EXPECT_TRUE(page["data"].isArray()); EXPECT_TRUE(page["data"].empty());
    EXPECT_EQ(page["pagination"]["page"].asInt(), 1); EXPECT_EQ(page["pagination"]["pageSize"].asInt(), 20);
    EXPECT_EQ(page["pagination"]["total"].asInt64(), 0);
    EXPECT_TRUE(service->people({}).data.empty());
    EXPECT_EQ(groups("author").total, 0); EXPECT_EQ(groups("source").total, 0);
    db->execSqlSync("INSERT INTO people(id,display_name) VALUES(1,'No credits')");
    const auto people = service->people({});
    ASSERT_EQ(people.data.size(), 1u); EXPECT_EQ(people.total, 1); EXPECT_EQ(people.data[0].midiCount, 0);
    EXPECT_EQ(groups("author").total, 0); EXPECT_EQ(service->overview().stats.people, 1);
}
TEST_F(CatalogPostgres, OverviewUsesGlobalDistinctCountsAndSixNewestEntries) {
    seed();
    const auto overview = service->overview();
    EXPECT_EQ(overview.stats.entries, 8); EXPECT_EQ(overview.stats.people, 3); EXPECT_EQ(overview.stats.files, 7);
    EXPECT_EQ(overview.stats.withFiles, 5); EXPECT_EQ(overview.stats.downloadable, 2); EXPECT_EQ(overview.stats.sources, 3);
    EXPECT_EQ(overview.stats.archived, 2); EXPECT_EQ(overview.stats.partiallyRecovered, 1);
    EXPECT_EQ(overview.stats.lost, 3); EXPECT_EQ(overview.stats.uncertain, 2);
    ASSERT_EQ(overview.recent.size(), 6u); ASSERT_EQ(overview.needsAttention.size(), 6u);
    const std::vector<std::int64_t> recent{8,7,6,5,4,3}, attention{8,7,6,4,3,2};
    for (std::size_t i = 0; i < 6; ++i) {
        EXPECT_EQ(overview.recent[i].id, recent[i]); EXPECT_EQ(overview.needsAttention[i].id, attention[i]);
        EXPECT_NE(overview.needsAttention[i].archiveStatus, "archived");
    }
    EXPECT_EQ(overview.recent[3].fileCount, 1); EXPECT_EQ(overview.recent[3].downloadableFileCount, 1);
    EXPECT_EQ(overview.recent[5].sources, (std::vector<std::string>{"none"}));
    EXPECT_EQ(overview.needsAttention[4].sources, overview.recent[5].sources);
    publicOnly(catalog::toJson(overview));
    db->execSqlSync("INSERT INTO midi_entries(id,slug,title,archive_status,updated_at) VALUES(9,'older','Older','lost','1999-01-01T00:00:00Z')");
    const auto expanded = service->overview();
    EXPECT_EQ(expanded.stats.entries, 9); EXPECT_EQ(expanded.stats.lost, 4);
    EXPECT_EQ(expanded.needsAttention.size(), 6u); EXPECT_EQ(expanded.needsAttention.back().id, 2);
}
TEST_F(CatalogPostgres, EntryPaginationAndTieSortingAreStable) {
    seed();
    EXPECT_EQ(ids(entries({{"pageSize", "2"}})), (std::vector<std::int64_t>{8,7}));
    const auto second = entries({{"page", "2"}, {"pageSize", "2"}});
    EXPECT_EQ(ids(second), (std::vector<std::int64_t>{6,5})); EXPECT_EQ(second.total, 8);
    EXPECT_EQ(second.page.number, 2); EXPECT_EQ(second.page.size, 2);
    EXPECT_EQ(ids(entries({{"sort", "title"}})), (std::vector<std::int64_t>{1,2,5,6,3,4,7,8}));
    EXPECT_EQ(ids(entries({{"sort", "title"}, {"page", "3"}, {"pageSize", "2"}})), (std::vector<std::int64_t>{3,4}));
    const auto beyond = entries({{"page", "1000000"}, {"pageSize", "100"}});
    EXPECT_TRUE(beyond.data.empty()); EXPECT_EQ(beyond.total, 8);
    const auto first = entries({{"sort", "title"}, {"pageSize", "1"}});
    ASSERT_EQ(first.data.size(), 1u);
    EXPECT_EQ(first.data[0].estimatedYear, 1999); EXPECT_EQ(first.data[0].updatedAt, "2020-01-01T00:00:00.000000Z");
    EXPECT_EQ(first.data[0].credits.size(), 3u); EXPECT_EQ(first.data[0].sources, (std::vector<std::string>{"Archive", "Second"}));
    EXPECT_EQ(first.data[0].fileCount, 3); EXPECT_EQ(first.data[0].downloadableFileCount, 2);
    publicOnly(catalog::toJson(first));
}
TEST_F(CatalogPostgres, FiltersIntersectAndSourceNamesAreLiteralNotUrls) {
    seed();
    EXPECT_EQ(ids(entries({{"status", "lost"}})), (std::vector<std::int64_t>{8,6,2}));
    EXPECT_EQ(ids(entries({{"person", "11"}})), (std::vector<std::int64_t>{5,2,1}));
    EXPECT_EQ(ids(entries({{"person", "11"}, {"source", "Archive"}, {"status", "lost"}})), (std::vector<std::int64_t>{2}));
    EXPECT_EQ(entries({{"person", "11"}, {"source", "Archive"}, {"status", "lost"}}).total, 1);
    EXPECT_EQ(ids(entries({{"source", "Archive"}})), (std::vector<std::int64_t>{2,1}));
    EXPECT_EQ(ids(entries({{"source", "none"}})), (std::vector<std::int64_t>{3}));
    for (const auto* source : {"archive", " Archive", "Archive ", "https://example.org/a", "' OR true --"})
        EXPECT_EQ(entries({{"source", source}}).total, 0);
    EXPECT_EQ(entries({{"person", "9223372036854775807"}}).total, 0);
    EXPECT_EQ(entries({{"source", "Archive"}, {"status", "uncertain"}}).total, 0);
    db->execSqlSync("INSERT INTO historical_sources(midi_id,website_name) VALUES(8,$1)", std::string("乐曲's website"));
    EXPECT_EQ(ids(entries({{"source", "乐曲's website"}})), (std::vector<std::int64_t>{8}));
}
TEST_F(CatalogPostgres, PeopleIncludesUncreditedAuthorsAndDistinctWorkCounts) {
    seed();
    const auto first = service->people({1,1});
    ASSERT_EQ(first.data.size(), 1u); EXPECT_EQ(first.total, 3); EXPECT_EQ(first.data[0].id, 11);
    EXPECT_EQ(first.data[0].midiCount, 3); EXPECT_EQ(first.data[0].biography, "Biography");
    EXPECT_EQ(first.data[0].aliases, (std::vector<std::string>{"Ace", "Zed"}));
    const auto second = service->people({2,1});
    ASSERT_EQ(second.data.size(), 1u); EXPECT_EQ(second.data[0].id, 12); EXPECT_EQ(second.data[0].midiCount, 2);
    EXPECT_FALSE(second.data[0].biography); EXPECT_EQ(second.data[0].aliases, (std::vector<std::string>{"Other"}));
    const auto third = service->people({3,1});
    ASSERT_EQ(third.data.size(), 1u); EXPECT_EQ(third.data[0].id, 13); EXPECT_EQ(third.data[0].midiCount, 0);
    EXPECT_TRUE(service->people({4,1}).data.empty()); EXPECT_EQ(service->people({4,1}).total, 3);
    const auto json = catalog::toJson(second);
    EXPECT_EQ(json["pagination"]["page"].asInt(), 2); EXPECT_EQ(json["pagination"]["pageSize"].asInt(), 1);
    EXPECT_EQ(json["pagination"]["total"].asInt64(), 3); EXPECT_TRUE(json["data"][0]["biography"].isNull());
    publicOnly(json);
}
TEST_F(CatalogPostgres, AuthorAndSourceGroupsCountDistinctWorksAndRoundTripFilters) {
    seed();
    const auto authors = groups("author");
    ASSERT_EQ(authors.data.size(), 3u); EXPECT_EQ(authors.total, 3);
    EXPECT_EQ(authors.data[0].key, "11"); EXPECT_EQ(authors.data[0].entries, 3);
    EXPECT_EQ(authors.data[0].withFiles, 3); EXPECT_EQ(authors.data[0].downloadable, 2);
    EXPECT_EQ(authors.data[1].key, "12"); EXPECT_EQ(authors.data[1].entries, 2);
    EXPECT_EQ(authors.data[1].withFiles, 2); EXPECT_EQ(authors.data[1].downloadable, 1);
    EXPECT_EQ(authors.data[2].key, ""); EXPECT_EQ(authors.data[2].label, "未署名"); EXPECT_EQ(authors.data[2].entries, 4);
    const auto sources = groups("source");
    ASSERT_EQ(sources.data.size(), 4u); EXPECT_EQ(sources.total, 4);
    EXPECT_EQ(sources.data[0].key, "Archive"); EXPECT_EQ(sources.data[0].entries, 2);
    EXPECT_EQ(sources.data[0].withFiles, 2); EXPECT_EQ(sources.data[0].downloadable, 1);
    EXPECT_EQ(sources.data[1].key, "Second"); EXPECT_EQ(sources.data[1].entries, 2); EXPECT_EQ(sources.data[1].downloadable, 2);
    EXPECT_EQ(sources.data[2].key, "none"); EXPECT_EQ(sources.data[2].entries, 1);
    EXPECT_EQ(sources.data[3].key, ""); EXPECT_EQ(sources.data[3].label, "来源待补"); EXPECT_EQ(sources.data[3].entries, 4);
    EXPECT_EQ(sources.data[3].withFiles, 1); EXPECT_EQ(sources.data[3].downloadable, 0);
    for (const auto& by : {std::string("author"), std::string("source")}) {
        for (const auto& group : groups(by).data) {
            catalog::QueryParameters filter;
            if (group.key.empty()) filter["missing"] = by;
            else filter[by == "author" ? "person" : "source"] = group.key;
            const auto matching = entries(filter);
            EXPECT_EQ(matching.total, group.entries);
            EXPECT_EQ(std::count_if(matching.data.begin(), matching.data.end(), [](const auto& e) { return e.fileCount > 0; }), group.withFiles);
            EXPECT_EQ(std::count_if(matching.data.begin(), matching.data.end(), [](const auto& e) { return e.downloadableFileCount > 0; }), group.downloadable);
        }
    }
    EXPECT_EQ(ids(entries({{"person", "none"}})), ids(entries({{"missing", "author"}})));
    EXPECT_EQ(ids(entries({{"missing", "source"}, {"status", "lost"}})), (std::vector<std::int64_t>{8,6}));
    EXPECT_EQ(entries({{"missing", "author"}, {"person", "11"}}).total, 0);
    EXPECT_EQ(entries({{"missing", "source"}, {"source", "none"}}).total, 0);
    const auto page = service->groups(catalog::parseGroupQuery({{"by", "source"}, {"page", "2"}, {"pageSize", "1"}}));
    ASSERT_EQ(page.data.size(), 1u); EXPECT_EQ(page.data[0].key, "Second"); EXPECT_EQ(page.total, 4);
    EXPECT_TRUE(service->groups({{1000000, 1}, "author"}).data.empty());
    publicOnly(catalog::toJson(page));
}
TEST_F(CatalogPostgres, SyntheticGroupsDisappearWhenEveryEntryIsAssigned) {
    seed();
    db->execSqlSync("INSERT INTO midi_credits(midi_id,person_id,role) SELECT m.id,11,'composer' FROM midi_entries m WHERE NOT EXISTS(SELECT 1 FROM midi_credits c WHERE c.midi_id=m.id)");
    db->execSqlSync("INSERT INTO historical_sources(midi_id,website_name) SELECT m.id,'none' FROM midi_entries m WHERE NOT EXISTS(SELECT 1 FROM historical_sources s WHERE s.midi_id=m.id)");
    for (const auto& group : groups("author").data) EXPECT_FALSE(group.key.empty());
    for (const auto& group : groups("source").data) EXPECT_FALSE(group.key.empty());
    EXPECT_EQ(entries({{"missing", "author"}}).total, 0); EXPECT_EQ(entries({{"missing", "source"}}).total, 0);
    EXPECT_EQ(entries({{"source", "none"}}).total, 5);
}
TEST_F(CatalogPostgres, DownloadCountsMatchDownloadAllowedIncludingLegacyNullRights) {
    // Only this isolated copy permits null rights, to exercise the SQL COALESCE.
    db->execSqlSync("ALTER TABLE midi_entries ALTER COLUMN distribution_permission DROP NOT NULL");
    const std::vector<std::optional<std::string>> rights{"unknown", "permission_granted", "restricted", "metadata_only", std::nullopt};
    std::int64_t expectedDownloadable = 0;
    for (std::size_t i = 0; i < rights.size(); ++i) {
        const auto id = static_cast<std::int64_t>(i + 1);
        db->execSqlSync("INSERT INTO midi_entries(id,slug,title,distribution_permission) VALUES($1,$2,'Rights',NULLIF($3,''))",
            id, "rights-" + std::to_string(id), rights[i].value_or(""));
        for (const bool confirmed : {false, true}) {
            const auto fileId = id * 2 + (confirmed ? 1 : 0);
            db->execSqlSync("INSERT INTO midi_files(id,midi_id,original_filename,sha256,storage_key,file_size,private_archive_confirmed) "
                "VALUES($1,$2,'fixture.mid',lpad(($1::bigint)::text,64,'0'),($1::bigint)::text,1,$3)", fileId, id, confirmed);
        }
        midi::MidiEntry entry; entry.distributionPermission = rights[i];
        midi::MidiFile file; file.publicDistributionConfirmed = true;
        const auto allowed = midi::downloadAllowed(entry, file);
        if (allowed) ++expectedDownloadable;
        const auto page = entries({{"sort", "title"}, {"page", std::to_string(id)}, {"pageSize", "1"}});
        ASSERT_EQ(page.data.size(), 1u); EXPECT_EQ(page.data[0].id, id);
        EXPECT_EQ(page.data[0].fileCount, 2); EXPECT_EQ(page.data[0].downloadableFileCount, allowed ? 1 : 0);
    }
    const auto overview = service->overview();
    EXPECT_EQ(overview.stats.files, 10); EXPECT_EQ(overview.stats.withFiles, 5); EXPECT_EQ(overview.stats.downloadable, expectedDownloadable);
    const auto source = groups("source");
    ASSERT_EQ(source.data.size(), 1u); EXPECT_EQ(source.data[0].withFiles, 5); EXPECT_EQ(source.data[0].downloadable, expectedDownloadable);
}
TEST_F(CatalogPostgres, QueryCountIsConstantAndEnrichmentIsBoundToSelectedIds) {
    seed();
    db->execSqlSync("INSERT INTO midi_entries(id,slug,title) SELECT n,'bulk-'||n,'Bulk '||n FROM generate_series(100,250) n");
    for (const auto* size : {"1", "100"}) {
        queries.clear();
        const auto result = entries({{"pageSize", size}});
        EXPECT_EQ(result.data.size(), static_cast<std::size_t>(std::stoi(size))); EXPECT_EQ(result.total, 159);
        ASSERT_EQ(queries.size(), 6u); // SET, count, page, credits, sources, files.
        EXPECT_EQ(queries[0], "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
        EXPECT_NE(queries[2].find("LIMIT $6 OFFSET $7"), std::string::npos);
        for (std::size_t i = 3; i < 6; ++i) EXPECT_NE(queries[i].find("ANY($1::bigint[])"), std::string::npos);
        for (const auto& sql : queries) EXPECT_EQ(sql.find("SELECT *"), std::string::npos);
    }
    db->execSqlSync("INSERT INTO people(id,display_name) SELECT n,'Bulk '||n FROM generate_series(100,250) n");
    for (const auto size : {1, 100}) {
        queries.clear(); service->people({1,size});
        ASSERT_EQ(queries.size(), 5u); // SET, count, page, aliases, distinct work counts.
        EXPECT_NE(queries[3].find("ANY($1::bigint[])"), std::string::npos);
        EXPECT_NE(queries[4].find("ANY($1::bigint[])"), std::string::npos);
    }
    queries.clear(); service->overview();
    ASSERT_EQ(queries.size(), 7u); // Both six-entry lists share the same three batches.
    for (std::size_t i = 4; i < 7; ++i) EXPECT_NE(queries[i].find("ANY($1::bigint[])"), std::string::npos);
    for (const auto* by : {"author", "source"}) {
        queries.clear(); groups(by); ASSERT_EQ(queries.size(), 3u);
        EXPECT_NE(queries.back().find("LIMIT $1 OFFSET $2"), std::string::npos);
    }
    queries.clear(); entries({{"page", "1000000"}}); EXPECT_EQ(queries.size(), 3u);
}
TEST_F(CatalogPostgres, TotalPageAndEnrichmentShareARepeatableReadSnapshot) {
    seed();
    bool changed = false;
    queryHook = [&](std::string_view sql) {
        if (changed || !sql.starts_with("SELECT m.id,m.slug")) return;
        changed = true; // The count already established the reader's snapshot.
        db->execSqlSync("INSERT INTO midi_entries(id,slug,title) VALUES(9,'new-entry','A new entry')");
        db->execSqlSync("UPDATE midi_entries SET title='Changed' WHERE id=1");
        db->execSqlSync("UPDATE midi_files SET private_archive_confirmed=false WHERE midi_id=1");
        db->execSqlSync("DELETE FROM midi_credits WHERE midi_id=1");
        db->execSqlSync("DELETE FROM historical_sources WHERE midi_id=1");
    };
    const auto page = entries({{"sort", "title"}});
    queryHook = {};
    EXPECT_TRUE(changed); EXPECT_EQ(page.total, 8); ASSERT_EQ(page.data.size(), 8u);
    EXPECT_EQ(page.data[0].id, 1); EXPECT_EQ(page.data[0].title, "Alpha");
    EXPECT_EQ(page.data[0].credits.size(), 3u); EXPECT_EQ(page.data[0].sources.size(), 2u);
    EXPECT_EQ(page.data[0].downloadableFileCount, 2);
    const auto refreshed = entries({{"sort", "title"}});
    EXPECT_EQ(refreshed.total, 9);
    const auto found = std::find_if(refreshed.data.begin(), refreshed.data.end(), [](const auto& entry) { return entry.id == 1; });
    ASSERT_NE(found, refreshed.data.end()); EXPECT_EQ(found->title, "Changed");
    EXPECT_TRUE(found->credits.empty()); EXPECT_TRUE(found->sources.empty()); EXPECT_EQ(found->downloadableFileCount, 0);
}
}  // namespace
