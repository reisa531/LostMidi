#include "midi/MidiService.h"
#include <algorithm>

namespace lostmidi::midi {
MidiPage MidiService::list(Page page) const {
    page.validate();
    MidiPage result;
    result.total = repository_.count();
    for (const auto& entry : repository_.list(page)) {
        result.data.push_back({entry, people_.creditsFor(entry.id)});
    }
    return result;
}

MidiDetail MidiService::getBySlug(const std::string& slug) const {
    const bool valid = !slug.empty() && slug.size() <= 160 &&
        std::all_of(slug.begin(), slug.end(), [](unsigned char c) {
            return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
        }) && slug.front() != '-' && slug.back() != '-' && slug.find("--") == std::string::npos;
    if (!valid) throw ApiError(400, "INVALID_SLUG", "Slug must contain lowercase letters, numbers and internal hyphens (maximum 160 characters).");
    auto entry = repository_.findBySlug(slug);
    if (!entry) throw ApiError(404, "MIDI_NOT_FOUND", "The requested MIDI entry does not exist.");
    return {*entry, people_.creditsFor(entry->id), people_.peopleFor(entry->id),
            recovery_.forMidi(entry->id), repository_.filesFor(entry->id)};
}
}  // namespace lostmidi::midi
