#pragma once
#include "midi/MidiRepository.h"
#include "midi/MidiValidator.h"
#include "storage/IObjectStorage.h"
#include <functional>

namespace lostmidi::midi {
struct FileEditor { MidiEntry entry; std::vector<MidiFile> files; };
struct FileImportResult { MidiFile file; bool duplicate; std::int64_t revision; };
struct MidiCreationFile {
    std::string filename;
    std::vector<std::byte> bytes;
    bool rightsConfirmed = false;
};
// Canonical RFC 4648 base64 only; reject oversized data before allocating bytes.
std::vector<std::byte> decodeMidiContentBase64(const std::string& encoded);
class IMidiImportRepository {
public:
    virtual ~IMidiImportRepository() = default;
    // Replays return the current entry without invoking persist() or changing metadata.
    virtual MidiEntry createWithRequest(const MidiEntry& entry, const std::string& requestId,
        const std::string& payloadSha256, const std::optional<MidiFile>& file,
        const std::function<void()>& persist) = 0;
    virtual FileEditor fileEditor(std::int64_t id) = 0;
    // Serializes each content hash across instances and checks the parent revision.
    // A committed journal must exist before persist() can write external storage.
    virtual FileImportResult importFile(const MidiFile& file, std::int64_t revision, const std::function<void()>& persist) = 0;
    virtual std::size_t cleanupImports(const std::function<void(const std::string&)>& remove) = 0;
};
class MidiImportService {
public:
    MidiImportService(IMidiImportRepository& repository, storage::IObjectStorage& objects, bool enabled)
        : repository_(repository), objects_(objects), enabled_(enabled) {}
    bool enabled() const { return enabled_; }
    MidiEntry create(MidiEntry entry, const std::string& requestId,
        const std::optional<MidiCreationFile>& file = std::nullopt);
    FileEditor get(std::int64_t id);
    FileImportResult import(std::int64_t id, std::int64_t revision, const std::string& filename,
        std::span<const std::byte> bytes, bool rightsConfirmed);
    std::size_t cleanup();
private:
    IMidiImportRepository& repository_;
    storage::IObjectStorage& objects_;
    bool enabled_;
};
}
