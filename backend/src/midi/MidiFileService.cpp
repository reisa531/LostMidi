#include "midi/MidiFileService.h"
#include "midi/MidiValidator.h"

namespace lostmidi::midi {
FileRegistration MidiFileService::registerFile(std::int64_t midiId, const std::string& filename,
                                               std::span<const std::byte> bytes) {
    if (midiId < 1) throw ApiError(400, "INVALID_FILE", "A positive MIDI id is required.");
    validateFilename(filename);
    validateFileContent(bytes);
    const auto digest = storage::sha256(bytes);
    if (auto existing = repository_.findBySha256(digest)) {
        // Idempotently repair a missing local object, if metadata already exists.
        storage_.store(existing->storageKey, bytes);
        return {*existing, true};
    }
    MidiFile file;
    file.midiId = midiId;
    file.originalFilename = filename;
    file.sha256 = digest;
    file.storageKey = digest;
    file.fileSize = bytes.size();
    storage_.store(digest, bytes);
    // Storage and PostgreSQL cannot share a transaction. On a DB error keep the
    // immutable object for retry; never delete an object another writer may use.
    const bool inserted = repository_.insertIfAbsent(file);
    auto registered = repository_.findBySha256(digest);
    if (!registered) throw std::runtime_error("Registered file could not be read.");
    return {*registered, !inserted};
}
}  // namespace lostmidi::midi
