#include "person/PersonWriteService.h"
#include "common/Error.h"
#include <set>

namespace lostmidi::person {
namespace {
void invalid() { throw ApiError(400, "INVALID_INPUT", "Invalid person or credit fields."); }
void text(std::string& value, std::size_t limit) {
    if (value.size() > limit || value.find('\0') != std::string::npos) invalid();
    const auto first = value.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) invalid();
    value = value.substr(first, value.find_last_not_of(" \t\r\n") - first + 1);
}
void positive(std::int64_t id) { if (id < 1) invalid(); }
}
PersonList PersonWriteService::list(Page page) {
    if (page.number < 1 || page.number > 1000000 || page.size < 1 || page.size > 100) invalid();
    return repository_.list(page);
}
PersonEdit PersonWriteService::get(std::int64_t id) { positive(id); return repository_.getEditor(id); }
void PersonWriteService::remove(std::int64_t id, std::int64_t revision) {
    positive(id); positive(revision);
    repository_.remove(id, revision);
}
PersonEdit PersonWriteService::save(std::int64_t id, PersonEdit edit) {
    if (id < 0 || (id && edit.person.revision < 1)) invalid();
    text(edit.person.displayName, 300);
    if (edit.person.biography) {
        if (edit.person.biography->size() > 20000 || edit.person.biography->find('\0') != std::string::npos) invalid();
        if (edit.person.biography->empty()) edit.person.biography.reset();
    }
    if (edit.aliases.size() > 50) invalid();
    std::set<std::string> unique;
    for (auto& alias : edit.aliases) {
        text(alias, 300);
        if (!unique.insert(alias).second) invalid();
    }
    return repository_.save(id, edit);
}
CreditEdit PersonWriteService::getCredits(std::int64_t id) { positive(id); return repository_.getCredits(id); }
CreditEdit PersonWriteService::saveCredits(std::int64_t id, const CreditEdit& edit) {
    positive(id);
    if (edit.revision < 1 || edit.credits.size() > 100) invalid();
    std::set<std::pair<std::int64_t, std::string>> unique;
    for (const auto& credit : edit.credits) {
        positive(credit.personId);
        if (credit.role != "composer" && credit.role != "arranger" && credit.role != "sequencer" && credit.role != "contributor") invalid();
        if (!unique.emplace(credit.personId, credit.role).second) invalid();
    }
    return repository_.saveCredits(id, edit);
}
}
