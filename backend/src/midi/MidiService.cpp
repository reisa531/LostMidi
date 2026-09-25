#include "midi/MidiService.h"
#include "midi/MidiValidator.h"
#include <algorithm>

namespace lostmidi::midi {
bool downloadAllowed(const MidiEntry& entry, const MidiFile& file) {
    return file.publicDistributionConfirmed && entry.distributionPermission != "restricted" &&
        entry.distributionPermission != "metadata_only";
}
MidiPage MidiService::list(Page page) const {
    page.validate();
    MidiPage result;
    result.total = repository_.count();
    for (const auto& entry : repository_.list(page)) {
        result.data.push_back({entry, people_.creditsFor(entry.id)});
    }
    return result;
}

MidiEntry MidiService::requireEntry(const std::string& slug) const {
    const bool valid = !slug.empty() && slug.size() <= 160 &&
        std::all_of(slug.begin(), slug.end(), [](unsigned char c) {
            return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
        }) && slug.front() != '-' && slug.back() != '-' && slug.find("--") == std::string::npos;
    if (!valid) throw ApiError(400, "INVALID_SLUG", "Slug must contain lowercase letters, numbers and internal hyphens (maximum 160 characters).");
    auto entry = repository_.findBySlug(slug);
    if (!entry) throw ApiError(404, "MIDI_NOT_FOUND", "The requested MIDI entry does not exist.");
    return *entry;
}

MidiDetail MidiService::getBySlug(const std::string& slug) const {
    const auto entry = requireEntry(slug);
    return {entry, people_.creditsFor(entry.id), people_.peopleFor(entry.id),
            recovery_.forMidi(entry.id), repository_.filesFor(entry.id)};
}
MidiDetail MidiService::getByPublicId(const std::string& id) const {
    auto entry = repository_.findByPublicId(id);
    if (!entry) throw ApiError(404, "MIDI_NOT_FOUND", "The requested MIDI entry does not exist.");
    return {*entry, people_.creditsFor(entry->id), people_.peopleFor(entry->id),
            recovery_.forMidi(entry->id), repository_.filesFor(entry->id)};
}

MidiFile MidiService::fileForDownload(const std::string& slug, std::int64_t fileId) const {
    if (fileId < 1) throw ApiError(400, "INVALID_FILE_ID", "File id must be a positive 64-bit integer.");
    const auto entry = requireEntry(slug);
    const auto files = repository_.filesFor(entry.id);
    const auto file = std::find_if(files.begin(), files.end(), [&](const MidiFile& f) { return f.id == fileId && f.midiId == entry.id; });
    if (file == files.end()) throw ApiError(404, "FILE_NOT_FOUND", "The requested MIDI file does not exist in this entry.");
    if (!downloadAllowed(entry, *file)) throw ApiError(403, "DOWNLOAD_NOT_ALLOWED", "This file is not available for public download.");
    if (file->fileSize == 0 || file->fileSize > maxImportBytes || file->storageKey != file->sha256 ||
        file->sha256.size() != 64 || file->sha256.find_first_not_of("0123456789abcdef") != std::string::npos)
        throw ApiError(503, "STORAGE_UNAVAILABLE", "The file is temporarily unavailable.");
    try { validateFilename(file->originalFilename); }
    catch (const ApiError&) { throw ApiError(503, "STORAGE_UNAVAILABLE", "The file is temporarily unavailable."); }
    return *file;
}
}  // namespace lostmidi::midi
