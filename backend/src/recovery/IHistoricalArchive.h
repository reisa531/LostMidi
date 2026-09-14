#pragma once
#include <string>
#include <vector>

namespace lostmidi::recovery {
struct ArchiveCapture {
    std::string capturedAt;
    std::string archiveUrl;
};
// Future boundary for a Wayback adapter. No network adapter is implemented yet.
class IHistoricalArchive {
public:
    virtual ~IHistoricalArchive() = default;
    virtual std::vector<ArchiveCapture> findCaptures(const std::string& originalUrl) = 0;
};
}  // namespace lostmidi::recovery
