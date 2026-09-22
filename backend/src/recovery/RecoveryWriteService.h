#pragma once
#include "recovery/Models.h"

namespace lostmidi::recovery {
struct HistoryEditor {
    std::int64_t midiId;
    std::string title;
    std::string slug;
    std::int64_t revision;
    History history;
};
struct SourceWriteResult { std::int64_t revision; HistoricalSource source; };
struct EventWriteResult { std::int64_t revision; RecoveryEvent event; };
struct DeleteResult { std::int64_t revision; std::int64_t deletedId; };

class IRecoveryWriter {
public:
    virtual ~IRecoveryWriter() = default;
    virtual HistoryEditor getHistory(std::int64_t midiId) = 0;
    // A zero child id creates a record; a positive id updates that record in place.
    virtual SourceWriteResult saveSource(std::int64_t midiId, std::int64_t sourceId,
        std::int64_t revision, const HistoricalSource& source) = 0;
    virtual EventWriteResult saveEvent(std::int64_t midiId, std::int64_t eventId,
        std::int64_t revision, const RecoveryEvent& event) = 0;
    virtual DeleteResult deleteSource(std::int64_t midiId, std::int64_t sourceId, std::int64_t revision) = 0;
    virtual DeleteResult deleteEvent(std::int64_t midiId, std::int64_t eventId, std::int64_t revision) = 0;
};

class RecoveryWriteService {
public:
    explicit RecoveryWriteService(IRecoveryWriter& repository) : repository_(repository) {}
    HistoryEditor getHistory(std::int64_t midiId);
    SourceWriteResult saveSource(std::int64_t midiId, std::int64_t sourceId,
        std::int64_t revision, HistoricalSource source);
    EventWriteResult saveEvent(std::int64_t midiId, std::int64_t eventId,
        std::int64_t revision, RecoveryEvent event);
    DeleteResult deleteSource(std::int64_t midiId, std::int64_t sourceId, std::int64_t revision);
    DeleteResult deleteEvent(std::int64_t midiId, std::int64_t eventId, std::int64_t revision);
private:
    IRecoveryWriter& repository_;
};
}  // namespace lostmidi::recovery
