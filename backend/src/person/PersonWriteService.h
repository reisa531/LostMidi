#pragma once
#include "person/Models.h"
#include "common/Pagination.h"

namespace lostmidi::person {
struct PersonEdit { Person person; std::vector<std::string> aliases; };
struct PersonList { std::vector<Person> data; std::int64_t total; };
struct CreditEdit { std::int64_t revision; std::vector<Credit> credits; };
class IPersonWriter {
public:
    virtual ~IPersonWriter() = default;
    virtual PersonList list(Page page) = 0;
    virtual PersonEdit getEditor(std::int64_t id) = 0;
    virtual PersonEdit save(std::int64_t id, const PersonEdit& edit) = 0;
    virtual void remove(std::int64_t id, std::int64_t revision, const std::string& actor) = 0;
    virtual CreditEdit getCredits(std::int64_t midiId) = 0;
    virtual CreditEdit saveCredits(std::int64_t midiId, const CreditEdit& edit) = 0;
};
class PersonWriteService {
public:
    explicit PersonWriteService(IPersonWriter& repository) : repository_(repository) {}
    PersonList list(Page page);
    PersonEdit get(std::int64_t id);
    PersonEdit save(std::int64_t id, PersonEdit edit);
    void remove(std::int64_t id, std::int64_t revision, const std::string& actor);
    CreditEdit getCredits(std::int64_t midiId);
    CreditEdit saveCredits(std::int64_t midiId, const CreditEdit& edit);
private:
    IPersonWriter& repository_;
};
}
