#include "midi/MidiImportService.h"

namespace lostmidi::midi {
FileEditor MidiImportService::get(std::int64_t id) {
    if (id < 1) throw ApiError(400, "INVALID_INPUT", "A positive MIDI id is required.");
    return repository_.fileEditor(id);
}
FileImportResult MidiImportService::import(std::int64_t id, std::int64_t revision, const std::string& filename,
    std::span<const std::byte> bytes, bool rightsConfirmed) {
    if (!enabled_) throw ApiError(503, "IMPORT_DISABLED", "File import is disabled until durable S3 storage is configured.");
    if (id < 1 || revision < 1) throw ApiError(400, "INVALID_INPUT", "A positive MIDI id and revision are required.");
    if (!rightsConfirmed) throw ApiError(400, "RIGHTS_CONFIRMATION_REQUIRED", "Confirm the right to publicly distribute this file.");
    validateMidiFilename(filename);
    validateMidi(bytes);
    // Check ownership and parent before creating any storage or journal records.
    repository_.fileEditor(id);
    MidiFile file; file.midiId = id; file.originalFilename = filename; file.publicDistributionConfirmed = true;
    file.sha256 = storage::sha256(bytes); file.storageKey = file.sha256; file.fileSize = bytes.size();
    return repository_.importFile(file, revision, [&] { objects_.store(file.storageKey, bytes); });
}
std::size_t MidiImportService::cleanup() {
    return repository_.cleanupImports([&](const std::string& key) { objects_.remove(key); });
}
}
