#include "recovery/PostgresRecoveryRepository.h"

namespace lostmidi::recovery {
std::vector<HistoricalSource> PostgresRecoveryRepository::sourcesFor(std::int64_t midiId) {
    std::vector<HistoricalSource> sources;
    for (const auto& row : db_->execSqlSync("SELECT * FROM historical_sources WHERE midi_id = $1 ORDER BY id", midiId)) {
        sources.push_back({row["id"].as<std::int64_t>(), row["website_name"].as<std::string>(),
            nullable<std::string>(row["original_url"]), nullable<std::string>(row["first_seen_at"]),
            nullable<std::string>(row["last_seen_at"]), nullable<std::string>(row["wayback_url"]), nullable<std::string>(row["notes"])});
    }
    return sources;
}
std::vector<RecoveryEvent> PostgresRecoveryRepository::eventsFor(std::int64_t midiId) {
    std::vector<RecoveryEvent> events;
    for (const auto& row : db_->execSqlSync(
        "SELECT r.*, p.display_name AS recovered_by_name FROM recovery_events r "
        "LEFT JOIN people p ON p.id = r.recovered_by WHERE r.midi_id = $1 ORDER BY r.recovered_at, r.id", midiId)) {
        events.push_back({row["id"].as<std::int64_t>(), nullable<std::string>(row["recovered_at"]),
            nullable<std::int64_t>(row["recovered_by"]), nullable<std::string>(row["recovered_by_name"]),
            row["story"].as<std::string>(), nullable<std::string>(row["evidence"]), row["created_at"].as<std::string>()});
    }
    return events;
}
}  // namespace lostmidi::recovery
