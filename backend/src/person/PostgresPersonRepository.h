#pragma once
#include "common/Database.h"
#include "person/PersonRepository.h"

namespace lostmidi::person {
class PostgresPersonRepository final : public IPersonRepository {
public:
    explicit PostgresPersonRepository(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    std::optional<Person> findById(std::int64_t id) override;
    std::vector<std::string> aliasesFor(std::int64_t id) override;
    std::vector<CreditedMidi> midisFor(std::int64_t id) override;
    std::vector<Credit> creditsFor(std::int64_t midiId) override;
    std::vector<Person> peopleFor(std::int64_t midiId) override;
private:
    drogon::orm::DbClientPtr db_;
};
}  // namespace lostmidi::person
