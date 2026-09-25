#pragma once
#include "person/Models.h"
#include "recovery/Models.h"

namespace lostmidi::midi {
struct MidiEntry {
    std::int64_t id = 0;
    std::string slug;
    std::string title;
    std::optional<std::string> description;
    std::optional<int> estimatedYear;
    std::string archiveStatus;
    std::string createdAt;
    std::string updatedAt;
    std::optional<std::string> copyrightStatus;
    std::optional<std::string> license;
    std::optional<std::string> rightsHolder;
    std::optional<std::string> distributionPermission;
    std::int64_t revision = 1;
    std::string publicId;
};
struct MidiFile {
    std::int64_t id = 0;
    std::int64_t midiId = 0;
    std::string originalFilename;
    std::string sha256;
    std::uint64_t fileSize = 0;
    std::string storageKey;
    std::optional<std::string> discoveredAt;
    std::string createdAt;
    bool publicDistributionConfirmed = false;
};
bool downloadAllowed(const MidiEntry& entry, const MidiFile& file);
struct MidiSummary {
    MidiEntry entry;
    std::vector<person::Credit> credits;
};
struct MidiPage {
    std::vector<MidiSummary> data;
    std::int64_t total = 0;
};
struct MidiDetail {
    MidiEntry entry;
    std::vector<person::Credit> credits;
    std::vector<person::Person> people;
    recovery::History history;
    std::vector<MidiFile> files;
};
}  // namespace lostmidi::midi
