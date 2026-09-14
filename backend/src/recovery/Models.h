#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace lostmidi::recovery {
struct HistoricalSource {
    std::int64_t id = 0;
    std::string websiteName;
    std::optional<std::string> originalUrl;
    std::optional<std::string> firstSeenAt;
    std::optional<std::string> lastSeenAt;
    std::optional<std::string> waybackUrl;
    std::optional<std::string> notes;
};
struct RecoveryEvent {
    std::int64_t id = 0;
    std::optional<std::string> recoveredAt;
    std::optional<std::int64_t> recoveredBy;
    std::optional<std::string> recoveredByName;
    std::string story;
    std::optional<std::string> evidence;
    std::string createdAt;
};
struct History {
    std::vector<HistoricalSource> sources;
    std::vector<RecoveryEvent> events;
};
}  // namespace lostmidi::recovery
