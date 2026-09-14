#include "midi/MidiFileService.h"
#include <cctype>

namespace lostmidi::midi {
namespace {
std::string trimWhitespace(std::string value) {
    auto begin = value.begin();
    while (begin != value.end() && std::isspace(static_cast<unsigned char>(*begin))) ++begin;
    auto end = value.end();
    while (end != begin && std::isspace(static_cast<unsigned char>(*(end - 1)))) --end;
    return std::string(begin, end);
}
}

FileRegistration MidiFileService::registerFile(std::int64_t midiId, const std::string& filename,
                                               std::span<const std::byte> bytes) {
    const std::string normalized = trimWhitespace(filename);
    if (midiId < 1 || normalized.empty() || normalized.size() > 255 || bytes.empty() ||
        bytes.size() > 64 * 1024 * 1024 || normalized.find_first_of("/\\") != std::string::npos ||
        normalized.find('\0') != std::string::npos) {
        throw ApiError(400, "INVALID_FILE", "A valid MIDI id, filename, and nonempty file up to 64 MiB are required.");
    }
    const auto digest = storage::sha256(bytes);
    if (auto existing = repository_.findBySha256(digest)) {
        // Idempotently repair a missing local object, if metadata already exists.
        storage_.store(existing->storageKey, bytes);
        return {*existing, true};
    }
    MidiFile file;
    file.midiId = midiId;
    file.originalFilename = normalized;
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
