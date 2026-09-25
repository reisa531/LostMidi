#pragma once
#include "common/Database.h"
#include "person/PersonRepository.h"
#include "person/PersonWriteService.h"

namespace lostmidi::person {
class PostgresPersonRepository final : public IPersonRepository, public IPersonWriter {
public:
    explicit PostgresPersonRepository(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    std::optional<Person> findById(std::int64_t id) override;
    std::optional<Person> findPersonByPublicId(const std::string& id) override;
    std::vector<std::string> aliasesFor(std::int64_t id) override;
    std::vector<CreditedMidi> midisFor(std::int64_t id) override;
    std::vector<Credit> creditsFor(std::int64_t midiId) override;
    std::vector<Person> peopleFor(std::int64_t midiId) override;
    PersonList list(Page page) override;
    PersonEdit getEditor(std::int64_t id) override;
    PersonEdit save(std::int64_t id, const PersonEdit& edit) override;
    void remove(std::int64_t id, std::int64_t revision, const std::string& actor) override;
    CreditEdit getCredits(std::int64_t midiId) override;
    CreditEdit saveCredits(std::int64_t midiId, const CreditEdit& edit) override;
private:
    drogon::orm::DbClientPtr db_;
};
}  // namespace lostmidi::person
