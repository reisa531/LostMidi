#include "midi/MidiWriteService.h"
#include "common/Error.h"
#include <regex>
#include <algorithm>

namespace lostmidi::midi {
namespace {
bool oneOf(const std::string& value, std::initializer_list<const char*> choices) {
    return std::any_of(choices.begin(), choices.end(), [&](const char* choice) { return value == choice; });
}
void text(std::optional<std::string>& value, std::size_t limit) {
    if (value && (value->size() > limit || value->find('\0') != std::string::npos))
        throw ApiError(400, "INVALID_INPUT", "Text is too long or contains a null character.");
    if (value && value->empty()) value.reset();
}
}
void MidiWriteService::validate(MidiEntry& entry) {
    const auto first = entry.title.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) throw ApiError(400, "INVALID_INPUT", "Title is required.");
    entry.title = entry.title.substr(first, entry.title.find_last_not_of(" \t\r\n") - first + 1);
    static const std::regex slug("^[a-z0-9]+(-[a-z0-9]+)*$");
    if (entry.title.size() > 300 || entry.title.find('\0') != std::string::npos ||
        entry.slug.size() > 160 || !std::regex_match(entry.slug, slug))
        throw ApiError(400, "INVALID_INPUT", "Title must be at most 300 UTF-8 bytes; slug must be lowercase words separated by hyphens (maximum 160).");
    if (entry.estimatedYear && (*entry.estimatedYear < 1 || *entry.estimatedYear > 9999))
        throw ApiError(400, "INVALID_INPUT", "Estimated year must be 1 to 9999 or null.");
    if (!oneOf(entry.archiveStatus, {"archived", "partially_recovered", "lost", "uncertain"}) ||
        !entry.copyrightStatus || !oneOf(*entry.copyrightStatus, {"unknown", "public_domain", "licensed", "copyrighted"}) ||
        !entry.distributionPermission || !oneOf(*entry.distributionPermission, {"unknown", "permission_granted", "metadata_only", "restricted"}))
        throw ApiError(400, "INVALID_INPUT", "Invalid archive or rights status.");
    text(entry.description, 20000); text(entry.license, 500); text(entry.rightsHolder, 500);
}
MidiEntry MidiWriteService::create(MidiEntry entry) { validate(entry); return repository_.create(entry); }
MidiEntry MidiWriteService::update(std::int64_t id, MidiEntry entry) {
    validate(entry);
    if (id < 1 || entry.revision < 1) throw ApiError(400, "INVALID_INPUT", "A valid id and revision are required.");
    return repository_.update(id, entry);
}
void MidiWriteService::remove(std::int64_t id, std::int64_t revision, const std::string& actor) {
    if (id < 1 || revision < 1 || actor.empty() || actor.size() > 100)
        throw ApiError(400, "INVALID_INPUT", "A valid id and revision are required.");
    repository_.remove(id, revision, actor);
}
MidiEntry MidiWriteService::get(std::int64_t id) {
    const auto entry = repository_.findById(id);
    if (!entry) throw ApiError(404, "MIDI_NOT_FOUND", "The requested MIDI entry does not exist.");
    return *entry;
}
}
