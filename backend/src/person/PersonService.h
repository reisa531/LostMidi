#pragma once
#include "person/PersonRepository.h"
#include "common/Error.h"

namespace lostmidi::person {
class PersonService {
public:
    explicit PersonService(IPersonRepository& repository) : repository_(repository) {}
    PersonDetail getById(std::int64_t id) const {
        if (id < 1) throw ApiError(400, "INVALID_PERSON_ID", "Person id must be a positive integer.");
        auto person = repository_.findById(id);
        if (!person) throw ApiError(404, "PERSON_NOT_FOUND", "The requested person does not exist.");
        return {*person, repository_.aliasesFor(id), repository_.midisFor(id)};
    }
    PersonDetail getByPublicId(const std::string& id) const {
        auto person = repository_.findPersonByPublicId(id);
        if (!person) throw ApiError(404, "PERSON_NOT_FOUND", "The requested person does not exist.");
        return {*person, repository_.aliasesFor(person->id), repository_.midisFor(person->id)};
    }
private:
    IPersonRepository& repository_;
};
}  // namespace lostmidi::person
