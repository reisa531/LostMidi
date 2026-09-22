#pragma once
#include "common/Database.h"
#include "recovery/RecoveryRepository.h"
#include "recovery/RecoveryWriteService.h"

namespace lostmidi::recovery {
class PostgresRecoveryRepository final : public IRecoveryRepository, public IRecoveryWriter {
public:
    explicit PostgresRecoveryRepository(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    std::vector<HistoricalSource> sourcesFor(std::int64_t midiId) override;
    std::vector<RecoveryEvent> eventsFor(std::int64_t midiId) override;
    HistoryEditor getHistory(std::int64_t midiId) override;
    SourceWriteResult saveSource(std::int64_t midiId, std::int64_t sourceId,
        std::int64_t revision, const HistoricalSource& source) override;
    EventWriteResult saveEvent(std::int64_t midiId, std::int64_t eventId,
        std::int64_t revision, const RecoveryEvent& event) override;
    DeleteResult deleteSource(std::int64_t midiId, std::int64_t sourceId, std::int64_t revision) override;
    DeleteResult deleteEvent(std::int64_t midiId, std::int64_t eventId, std::int64_t revision) override;
private:
    drogon::orm::DbClientPtr db_;
};
}  // namespace lostmidi::recovery
