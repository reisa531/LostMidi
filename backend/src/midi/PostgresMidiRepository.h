#pragma once
#include "common/Database.h"
#include "midi/MidiRepository.h"
#include "midi/MidiWriteService.h"

namespace lostmidi::midi {
class PostgresMidiRepository final : public IMidiRepository, public IMidiFileRepository, public IMidiWriter {
public:
    explicit PostgresMidiRepository(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    std::vector<MidiEntry> list(Page page) override;
    std::int64_t count() override;
    std::optional<MidiEntry> findBySlug(const std::string& slug) override;
    std::vector<MidiFile> filesFor(std::int64_t midiId) override;
    std::optional<MidiFile> findBySha256(const std::string& digest) override;
    bool insertIfAbsent(const MidiFile& file) override;
    MidiEntry create(const MidiEntry& entry) override;
    MidiEntry update(std::int64_t id, const MidiEntry& entry) override;
    std::optional<MidiEntry> findById(std::int64_t id) override;
private:
    drogon::orm::DbClientPtr db_;
};
}  // namespace lostmidi::midi
