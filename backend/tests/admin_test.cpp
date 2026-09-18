#include <gtest/gtest.h>
#include "auth/Password.h"
#include "midi/MidiWriteService.h"
#include "person/PersonWriteService.h"
#include "common/Error.h"

using namespace lostmidi;
namespace {
class Writer : public midi::IMidiWriter {
public:
    int writes = 0;
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
    person::PersonList list(Page) override { return {{}, 0}; }
    person::PersonEdit getEditor(std::int64_t) override { return {}; }
    person::PersonEdit save(std::int64_t, const person::PersonEdit& edit) override { ++writes; return edit; }
    person::CreditEdit getCredits(std::int64_t) override { return {1, {}}; }
    person::CreditEdit saveCredits(std::int64_t, const person::CreditEdit& edit) override { ++writes; return edit; }
};
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
}
