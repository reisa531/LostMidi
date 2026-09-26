#include "person/PersonWriteService.h"
#include "common/Error.h"
#include <set>
#include <sstream>
#include <json/json.h>

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
void PersonWriteService::remove(std::int64_t id, std::int64_t revision, const std::string& actor) {
    positive(id); positive(revision);
    if (actor.empty() || actor.size() > 100) invalid();
    repository_.remove(id, revision, actor);
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
    if (edit.summaryProvided && edit.person.summary) {
        if (edit.person.summary->size() > 500 || edit.person.summary->find('\0') != std::string::npos) invalid();
        if (edit.person.summary->empty()) edit.person.summary.reset();
    }
    if (edit.profileProvided) {
        if (edit.person.profile.size() > 100000) invalid();
        Json::Value profile; Json::CharReaderBuilder reader; std::string errors; std::istringstream input(edit.person.profile);
        if (!Json::parseFromStream(reader, input, &profile, &errors) || !profile.isObject()) invalid();
        const std::set<std::string> allowedProfile{"pronunciation","otherNames","gender","birthText","birthCertainty","birthplace","residence","education","activePeriod","activeTime","country","roles","aliasDetails","sites","timeline","sources","sameAs","works","collaborators","rights"};
        for (const auto& key : profile.getMemberNames()) {
            const auto& value = profile[key];
            if (!allowedProfile.contains(key)) invalid();
            const bool arrayKey = key == "otherNames" || key == "roles" || key == "aliasDetails" || key == "sites" || key == "timeline" || key == "sources" || key == "sameAs" || key == "works" || key == "collaborators";
            if (arrayKey != value.isArray() && !value.isNull() && !(key == "activePeriod" && value.isObject())) invalid();
            if (!arrayKey && key != "activePeriod" && !value.isNull() && !value.isString()) invalid();
            if ((value.isString() && (value.asString().size() > 20000 || value.asString().find('\0') != std::string::npos)) ||
                (value.isArray() && value.size() > 100)) invalid();
            if (value.isArray()) for (const auto& item : value) {
                if (item.isString() && (item.asString().size() > (key == "sameAs" ? 8192 : 2000) || item.asString().find('\0') != std::string::npos)) invalid();
                if (!item.isString() && !item.isObject()) invalid();
                if (item.isObject()) for (const auto& field : item.getMemberNames()) {
                    const auto& detail = item[field];
                    if (!detail.isNull() && !detail.isString() && !detail.isInt64() && !detail.isInt()) invalid();
                    if (detail.isString() && (detail.asString().size() > 2000 || detail.asString().find('\0') != std::string::npos)) invalid();
                    if ((field == "url" || key == "sameAs") && detail.isString() &&
                        !(detail.asString().starts_with("https://") || detail.asString().starts_with("http://"))) invalid();
                }
            }
        }
        for (const auto& key : {"otherNames","roles","sameAs","aliasDetails","sites","timeline","sources","works","collaborators"})
            if (!profile[key].isNull() && !profile[key].isArray()) invalid();
        if (!profile["sameAs"].isNull() && profile["sameAs"].size() > 50) invalid();
        if (!profile["aliasDetails"].isNull() && profile["aliasDetails"].size() > 50) invalid();
        if (!profile["sameAs"].isNull()) for (const auto& url : profile["sameAs"])
            if (!url.isString() || !url.asString().starts_with("https://")) invalid();
        if (!profile["activePeriod"].isNull() && !profile["activePeriod"].isObject()) invalid();
        if (!profile["activePeriod"].isNull()) for (const auto& field : profile["activePeriod"].getMemberNames())
            if (!profile["activePeriod"][field].isNull() && !profile["activePeriod"][field].isString()) invalid();
        if (!profile["birthCertainty"].isNull() && profile["birthCertainty"].isString() &&
            profile["birthCertainty"].asString() != "unknown" && profile["birthCertainty"].asString() != "approximate" && profile["birthCertainty"].asString() != "confirmed") invalid();
        const auto& details = profile["aliasDetails"];
        if (!details.isNull()) {
            if (!details.isArray() || details.size() > 50) invalid();
            std::set<std::string> known(edit.aliases.begin(), edit.aliases.end());
            for (auto& detail : details) {
                if (!detail.isObject() || !detail["name"].isString() || !known.contains(detail["name"].asString())) invalid();
                for (const auto& field : detail.getMemberNames())
                    if (detail[field].isString() && (detail[field].asString().size() > 2000 || detail[field].asString().find('\0') != std::string::npos)) invalid();
            }
        }
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
