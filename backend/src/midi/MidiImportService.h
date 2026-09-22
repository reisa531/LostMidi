#pragma once
#include "midi/MidiRepository.h"
#include "midi/MidiValidator.h"
#include "storage/IObjectStorage.h"
#include <functional>

namespace lostmidi::midi {
struct FileEditor { MidiEntry entry; std::vector<MidiFile> files; };
struct FileImportResult { MidiFile file; bool duplicate; std::int64_t revision; };
class IMidiImportRepository {
public:
    virtual ~IMidiImportRepository() = default;
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
