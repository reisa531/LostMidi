#pragma once
#include "person/Models.h"

namespace lostmidi::person {
class IPersonRepository {
public:
    virtual ~IPersonRepository() = default;
    virtual std::optional<Person> findById(std::int64_t id) = 0;
    virtual std::optional<Person> findPersonByPublicId(const std::string& id) = 0;
    virtual std::vector<std::string> aliasesFor(std::int64_t id) = 0;
    virtual std::vector<CreditedMidi> midisFor(std::int64_t id) = 0;
    virtual std::vector<Credit> creditsFor(std::int64_t midiId) = 0;
    virtual std::vector<Person> peopleFor(std::int64_t midiId) = 0;
};
}  // namespace lostmidi::person
