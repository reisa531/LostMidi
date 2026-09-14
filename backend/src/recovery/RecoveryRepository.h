#pragma once
#include "recovery/Models.h"

namespace lostmidi::recovery {
class IRecoveryRepository {
public:
    virtual ~IRecoveryRepository() = default;
    virtual std::vector<HistoricalSource> sourcesFor(std::int64_t midiId) = 0;
    virtual std::vector<RecoveryEvent> eventsFor(std::int64_t midiId) = 0;
};

class RecoveryService {
public:
    explicit RecoveryService(IRecoveryRepository& repository) : repository_(repository) {}
    History forMidi(std::int64_t midiId) const {
        return {repository_.sourcesFor(midiId), repository_.eventsFor(midiId)};
    }
private:
    IRecoveryRepository& repository_;
};
}  // namespace lostmidi::recovery
