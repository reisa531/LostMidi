#pragma once
#include "common/Database.h"
#include "recovery/RecoveryRepository.h"

namespace lostmidi::recovery {
class PostgresRecoveryRepository final : public IRecoveryRepository {
public:
    explicit PostgresRecoveryRepository(drogon::orm::DbClientPtr db) : db_(std::move(db)) {}
    std::vector<HistoricalSource> sourcesFor(std::int64_t midiId) override;
    std::vector<RecoveryEvent> eventsFor(std::int64_t midiId) override;
private:
    drogon::orm::DbClientPtr db_;
};
}  // namespace lostmidi::recovery
