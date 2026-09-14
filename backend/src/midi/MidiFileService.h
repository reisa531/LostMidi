#pragma once
#include "midi/MidiRepository.h"
#include "storage/IObjectStorage.h"

namespace lostmidi::midi {
struct FileRegistration {
    MidiFile file;
    bool duplicate;
};

// Internal foundation for a future import command or upload workflow.
// This registers exact bytes; format parsing and public upload are future work.
class MidiFileService {
public:
    MidiFileService(IMidiFileRepository& repository, storage::IObjectStorage& storage)
        : repository_(repository), storage_(storage) {}
    FileRegistration registerFile(std::int64_t midiId, const std::string& filename,
                                  std::span<const std::byte> bytes);
private:
    IMidiFileRepository& repository_;
    storage::IObjectStorage& storage_;
};
}  // namespace lostmidi::midi
