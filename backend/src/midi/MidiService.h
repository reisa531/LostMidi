#pragma once
#include "midi/MidiRepository.h"
#include "person/PersonRepository.h"
#include "recovery/RecoveryRepository.h"

namespace lostmidi::midi {
class MidiService {
public:
    MidiService(IMidiRepository& repository, person::IPersonRepository& people,
                recovery::RecoveryService& recovery)
        : repository_(repository), people_(people), recovery_(recovery) {}
    MidiPage list(Page page) const;
    MidiDetail getBySlug(const std::string& slug) const;
private:
    IMidiRepository& repository_;
    person::IPersonRepository& people_;
    recovery::RecoveryService& recovery_;
};
}  // namespace lostmidi::midi
