#pragma once
#include "midi/Models.h"

namespace lostmidi::midi {
class IMidiWriter {
public:
    virtual ~IMidiWriter() = default;
    virtual MidiEntry create(const MidiEntry& entry) = 0;
    virtual MidiEntry update(std::int64_t id, const MidiEntry& entry) = 0;
    virtual std::optional<MidiEntry> findById(std::int64_t id) = 0;
};
class MidiWriteService {
public:
    explicit MidiWriteService(IMidiWriter& repository) : repository_(repository) {}
    MidiEntry create(MidiEntry entry);
    MidiEntry update(std::int64_t id, MidiEntry entry);
    MidiEntry get(std::int64_t id);
    static void validate(MidiEntry& entry);
private:
    IMidiWriter& repository_;
};
}
