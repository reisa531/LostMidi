#pragma once
#include "midi/Models.h"
#include "common/Pagination.h"

namespace lostmidi::midi {
class IMidiRepository {
public:
    virtual ~IMidiRepository() = default;
    virtual std::vector<MidiEntry> list(Page page) = 0;
    virtual std::int64_t count() = 0;
    virtual std::optional<MidiEntry> findBySlug(const std::string& slug) = 0;
    virtual std::optional<MidiEntry> findByPublicId(const std::string& id) = 0;
    virtual std::vector<MidiFile> filesFor(std::int64_t midiId) = 0;
};

class IMidiFileRepository {
public:
    virtual ~IMidiFileRepository() = default;
    virtual std::optional<MidiFile> findBySha256(const std::string& sha256) = 0;
    // The DB unique constraint decides concurrent duplicate registrations.
    virtual bool insertIfAbsent(const MidiFile& file) = 0;
};
}  // namespace lostmidi::midi
