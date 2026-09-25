#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace lostmidi::recovery {
struct EvidenceFile {
    std::int64_t id = 0;
    std::string filename;
    std::string mediaType;
    std::string sha256;
    std::uint32_t fileSize = 0;
    std::string createdAt;
};
struct HistoricalSource {
    std::int64_t id = 0;
    std::string websiteName;
    std::optional<std::string> originalUrl;
    std::optional<std::string> firstSeenAt;
    std::optional<std::string> lastSeenAt;
    std::optional<std::string> waybackUrl;
    std::optional<std::string> notes;
    std::string sourceType = "other";
    int credibility = 3;
    std::optional<std::string> checkedAt;
    std::vector<EvidenceFile> evidenceFiles;
};
struct RecoveryEvent {
    std::int64_t id = 0;
    std::optional<std::string> recoveredAt;
    std::optional<std::int64_t> recoveredBy;
    std::optional<std::string> recoveredByName;
    std::string story;
    std::optional<std::string> evidence;
    std::string createdAt;
    std::vector<EvidenceFile> evidenceFiles;
};
struct History {
    std::vector<HistoricalSource> sources;
    std::vector<RecoveryEvent> events;
};
}  // namespace lostmidi::recovery
