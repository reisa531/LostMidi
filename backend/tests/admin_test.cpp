#include <gtest/gtest.h>
#include "auth/Password.h"
#include "midi/MidiWriteService.h"
#include "person/PersonWriteService.h"
#include "recovery/RecoveryWriteService.h"
#include "common/Error.h"

using namespace lostmidi;
namespace {
class Writer : public midi::IMidiWriter {
public:
    int writes = 0;
    void remove(std::int64_t, std::int64_t, const std::string&) override { ++writes; }
    midi::MidiEntry create(const midi::MidiEntry& entry) override { ++writes; return entry; }
    midi::MidiEntry update(std::int64_t, const midi::MidiEntry& entry) override { ++writes; return entry; }
    std::optional<midi::MidiEntry> findById(std::int64_t) override { return std::nullopt; }
};
midi::MidiEntry draft() {
    midi::MidiEntry e;
    e.title = "  Example  "; e.slug = "example"; e.archiveStatus = "uncertain";
    e.copyrightStatus = "unknown"; e.distributionPermission = "metadata_only";
    return e;
}
TEST(AdminWrite, RejectsInvalidFieldsBeforePersistence) {
    Writer repository; midi::MidiWriteService service(repository);
    auto e = draft(); e.title = "  "; EXPECT_THROW(service.create(e), ApiError);
    e = draft(); e.slug = "Bad--Slug"; EXPECT_THROW(service.create(e), ApiError);
    e = draft(); e.estimatedYear = 10000; EXPECT_THROW(service.create(e), ApiError);
    e = draft(); e.archiveStatus = "invalid"; EXPECT_THROW(service.create(e), ApiError);
    e = draft(); e.description = std::string(20001, 'x'); EXPECT_THROW(service.create(e), ApiError);
    e = draft(); e.revision = 0; EXPECT_THROW(service.update(1, e), ApiError);
    EXPECT_EQ(repository.writes, 0);
}
TEST(AdminWrite, NormalizesTitleAndEmptyOptionalText) {
    Writer repository; midi::MidiWriteService service(repository);
    auto e = draft(); e.description = "";
    const auto saved = service.create(e);
    EXPECT_EQ(saved.title, "Example"); EXPECT_FALSE(saved.description); EXPECT_EQ(repository.writes, 1);
}
TEST(AdminPassword, RejectsMalformedOrWeakHashFormats) {
    EXPECT_FALSE(auth::validPasswordHash("plaintext"));
    EXPECT_FALSE(auth::validPasswordHash("pbkdf2_sha256:1:" + std::string(32,'0') + ":" + std::string(64,'0')));
    EXPECT_FALSE(auth::verifyPassword("anything", "plaintext"));
}
TEST(AdminPassword, TokensAreRandomAndOnlyDigestIsPersisted) {
    const auto first = auth::randomToken(); const auto second = auth::randomToken();
    EXPECT_EQ(first.size(), 64u); EXPECT_NE(first, second);
    EXPECT_EQ(auth::digest(first).size(), 64u); EXPECT_NE(auth::digest(first), first);
}
class PersonWriter : public person::IPersonWriter {
public:
    int writes = 0;
    void remove(std::int64_t, std::int64_t, const std::string&) override { ++writes; }
    person::PersonList list(Page) override { return {{}, 0}; }
    person::PersonEdit getEditor(std::int64_t) override { return {}; }
    person::PersonEdit save(std::int64_t, const person::PersonEdit& edit) override { ++writes; return edit; }
    person::CreditEdit getCredits(std::int64_t) override { return {1, {}}; }
    person::CreditEdit saveCredits(std::int64_t, const person::CreditEdit& edit) override { ++writes; return edit; }
};
TEST(AdminDelete, RequiresPositiveIdentityAndRevision) {
    Writer midis; midi::MidiWriteService midiService(midis);
    PersonWriter people; person::PersonWriteService personService(people);
    for (const auto& [id, revision] : {std::pair<std::int64_t, std::int64_t>{0, 1}, {-1, 1}, {1, 0}, {1, -1}}) {
        EXPECT_THROW(midiService.remove(id, revision, "admin"), ApiError);
        EXPECT_THROW(personService.remove(id, revision, "admin"), ApiError);
    }
    EXPECT_EQ(midis.writes, 0); EXPECT_EQ(people.writes, 0);
    midiService.remove(1, 1, "admin"); personService.remove(1, 1, "admin");
    EXPECT_EQ(midis.writes, 1); EXPECT_EQ(people.writes, 1);
}
TEST(PersonWrite, RejectsAmbiguousAliasesAndInvalidCreditsBeforePersistence) {
    PersonWriter writer; person::PersonWriteService service(writer);
    person::PersonEdit edit; edit.person.displayName = "Name"; edit.aliases = {"old", " old "};
    EXPECT_THROW(service.save(0, edit), ApiError);
    edit.aliases = {" "}; EXPECT_THROW(service.save(0, edit), ApiError);
    edit.aliases = {}; edit.person.displayName = "\t"; EXPECT_THROW(service.save(0, edit), ApiError);
    EXPECT_THROW(service.saveCredits(1, {1, {{1, "", "invalid"}}}), ApiError);
    EXPECT_THROW(service.saveCredits(1, {1, {{1, "", "composer"}, {1, "", "composer"}}}), ApiError);
    EXPECT_THROW(service.saveCredits(1, {0, {}}), ApiError);
    EXPECT_EQ(writer.writes, 0);
}
TEST(PersonWrite, NormalizesTextAndAllowsMultipleRoles) {
    PersonWriter writer; person::PersonWriteService service(writer);
    person::PersonEdit edit; edit.person.displayName = "  Name "; edit.person.biography = ""; edit.aliases = {" old "};
    const auto saved = service.save(0, edit);
    EXPECT_EQ(saved.person.displayName, "Name"); EXPECT_FALSE(saved.person.biography);
    ASSERT_EQ(saved.aliases.size(), 1u); EXPECT_EQ(saved.aliases[0], "old");
    EXPECT_NO_THROW(service.saveCredits(1, {1, {{1, "", "composer"}, {1, "", "sequencer"}}}));
    EXPECT_NO_THROW(service.saveCredits(1, {1, {}}));
}
class RecoveryWriter : public recovery::IRecoveryWriter {
public:
    int writes = 0;
    recovery::HistoryEditor getHistory(std::int64_t) override { return {}; }
    recovery::SourceWriteResult saveSource(std::int64_t, std::int64_t, std::int64_t revision,
        const recovery::HistoricalSource& source) override { ++writes; return {revision + 1, source}; }
    recovery::EventWriteResult saveEvent(std::int64_t, std::int64_t, std::int64_t revision,
        const recovery::RecoveryEvent& event) override { ++writes; return {revision + 1, event}; }
    recovery::DeleteResult deleteSource(std::int64_t, std::int64_t id, std::int64_t revision) override {
        ++writes; return {revision + 1, id};
    }
    recovery::DeleteResult deleteEvent(std::int64_t, std::int64_t id, std::int64_t revision) override {
        ++writes; return {revision + 1, id};
    }
};
TEST(RecoveryWrite, ValidatesUrlsAndTextBeforePersistence) {
    RecoveryWriter writer; recovery::RecoveryWriteService service(writer);
    recovery::HistoricalSource source; source.websiteName = "Archive";
    for (const auto* url : {"javascript:alert(1)", "/relative", "https://", "https://user:pass@example.org/",
                           "https://example.org/a b", "https://example.org\\path", "https://example.org/\npath",
                           "https:///no-host", "http://[broken", "https://example.org:invalid/"}) {
        source.originalUrl = url;
        EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError) << url;
    }
    source.originalUrl.reset(); source.websiteName = "  \t";
    EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError);
    source.websiteName = std::string(301, 'x');
    EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError);
    source.websiteName = "Archive"; source.notes = std::string("a\0b", 3);
    EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError);
    source.notes = std::string(20001, 'x');
    EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError);
    recovery::RecoveryEvent event; event.story = " ";
    EXPECT_THROW(service.saveEvent(1, 0, 1, event), ApiError);
    event.story = "A story"; event.recoveredBy = 0;
    EXPECT_THROW(service.saveEvent(1, 0, 1, event), ApiError);
    EXPECT_THROW(service.deleteSource(1, 0, 1), ApiError);
    EXPECT_THROW(service.deleteEvent(1, 1, 0), ApiError);
    EXPECT_EQ(writer.writes, 0);
}
TEST(RecoveryWrite, ValidatesProvenanceTypeCredibilityAndVerificationTime) {
    RecoveryWriter writer; recovery::RecoveryWriteService service(writer);
    recovery::HistoricalSource source; source.websiteName = "Archive";
    source.sourceType = "not-a-source";
    EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError);
    source.sourceType = "archive"; source.credibility = 0;
    EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError);
    source.credibility = 6;
    EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError);
    source.credibility = 5; source.checkedAt = "2026-02-30T12:00:00Z";
    EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError);
    source.checkedAt = "2026-02-28T12:00:00.123Z";
    const auto saved = service.saveSource(1, 0, 1, source);
    EXPECT_EQ(saved.source.sourceType, "archive");
    EXPECT_EQ(saved.source.credibility, 5);
    EXPECT_EQ(saved.source.checkedAt, "2026-02-28T12:00:00.123000Z");
    EXPECT_EQ(writer.writes, 1);
}
TEST(RecoveryWrite, StrictCalendarAndMicrosecondOrdering) {
    RecoveryWriter writer; recovery::RecoveryWriteService service(writer);
    recovery::HistoricalSource source; source.websiteName = "Archive";
    for (const auto* date : {"2025-02-29T00:00:00Z", "1900-02-29T00:00:00Z", "2000-04-31T00:00:00Z",
                            "0000-01-01T00:00:00Z", "2020-13-01T00:00:00Z", "2020-01-01T24:00:00Z",
                            "2020-01-01T00:60:00Z", "2020-01-01T00:00:60Z", "2020-01-01",
                            "2020-01-01T00:00:00+00:00", "2020-01-01T00:00:00.1234567Z"}) {
        source.firstSeenAt = date;
        EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError) << date;
    }
    EXPECT_EQ(writer.writes, 0);
    source.firstSeenAt = "2000-02-29T00:00:00.1Z";
    source.lastSeenAt = "2000-02-29T00:00:00.09Z";
    EXPECT_THROW(service.saveSource(1, 0, 1, source), ApiError);
    source.lastSeenAt = "2000-02-29T00:00:00.100001Z";
    const auto result = service.saveSource(1, 0, 1, source);
    EXPECT_EQ(result.source.firstSeenAt, "2000-02-29T00:00:00.100000Z");
    EXPECT_EQ(result.source.lastSeenAt, "2000-02-29T00:00:00.100001Z");
    source.firstSeenAt = "0001-01-01T00:00:00Z"; source.lastSeenAt = "9999-12-31T23:59:59Z";
    EXPECT_NO_THROW(service.saveSource(1, 0, 1, source));
}
TEST(RecoveryWrite, PreservesUnknownDatesAndNormalizesOptionalText) {
    RecoveryWriter writer; recovery::RecoveryWriteService service(writer);
    recovery::HistoricalSource source; source.websiteName = "  Archive \t"; source.notes = "";
    source.originalUrl = "https://example.org/a?b=1#c";
    const auto saved = service.saveSource(1, 0, 1, source);
    EXPECT_EQ(saved.source.websiteName, "Archive"); EXPECT_FALSE(saved.source.notes);
    EXPECT_FALSE(saved.source.firstSeenAt); EXPECT_FALSE(saved.source.lastSeenAt);
    recovery::RecoveryEvent event; event.story = "  Unknown date  "; event.evidence = "";
    const auto result = service.saveEvent(1, 0, 2, event);
    EXPECT_EQ(result.event.story, "Unknown date"); EXPECT_FALSE(result.event.recoveredAt);
    EXPECT_FALSE(result.event.recoveredBy); EXPECT_FALSE(result.event.evidence);
}
}
