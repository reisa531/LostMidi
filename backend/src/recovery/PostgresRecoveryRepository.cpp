#include "recovery/PostgresRecoveryRepository.h"
#include "common/Error.h"
#include "common/Transaction.h"

namespace lostmidi::recovery {
namespace {
// Use the same microsecond-preserving UTC representation for public and editor reads.
const std::string sourceSelect = R"SQL(
    SELECT id, website_name, original_url, wayback_url, notes, source_type, credibility,
        to_char(checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS checked_at,
        to_char(first_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS first_seen_at,
        to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_seen_at
    FROM historical_sources
)SQL";
const std::string eventSelect = R"SQL(
    SELECT r.id, CASE WHEN p.id IS NULL THEN NULL ELSE r.recovered_by END AS recovered_by, COALESCE(r.recovered_by_name,p.display_name) AS recovered_by_name, r.story, r.evidence,
        to_char(r.recovered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recovered_at,
        to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
    FROM recovery_events r LEFT JOIN people p ON p.id = r.recovered_by AND p.deleted_at IS NULL
)SQL";
HistoricalSource sourceFrom(const drogon::orm::Row& row) {
    return {row["id"].as<std::int64_t>(), row["website_name"].as<std::string>(),
        nullable<std::string>(row["original_url"]), nullable<std::string>(row["first_seen_at"]),
        nullable<std::string>(row["last_seen_at"]), nullable<std::string>(row["wayback_url"]), nullable<std::string>(row["notes"]),
        row["source_type"].as<std::string>(), row["credibility"].as<int>(), nullable<std::string>(row["checked_at"]), {}};
}
RecoveryEvent eventFrom(const drogon::orm::Row& row) {
    return {row["id"].as<std::int64_t>(), nullable<std::string>(row["recovered_at"]),
        nullable<std::int64_t>(row["recovered_by"]), nullable<std::string>(row["recovered_by_name"]),
        row["story"].as<std::string>(), nullable<std::string>(row["evidence"]), row["created_at"].as<std::string>(), {}};
}
EvidenceFile evidenceFrom(const drogon::orm::Row& row) {
    return {row["id"].as<std::int64_t>(), row["original_filename"].as<std::string>(),
        row["media_type"].as<std::string>(), row["sha256"].as<std::string>(),
        row["file_size"].as<std::uint32_t>(), row["created_at"].as<std::string>()};
}
std::vector<EvidenceFile> sourceEvidence(const drogon::orm::DbClientPtr& db, std::int64_t midiId, std::int64_t sourceId) {
    std::vector<EvidenceFile> result;
    for (const auto& row : db->execSqlSync("SELECT id,original_filename,media_type,sha256,file_size,created_at FROM historical_evidence WHERE midi_id=$1 AND source_id=$2 ORDER BY id", midiId, sourceId))
        result.push_back(evidenceFrom(row));
    return result;
}
std::vector<EvidenceFile> eventEvidence(const drogon::orm::DbClientPtr& db, std::int64_t midiId, std::int64_t eventId) {
    std::vector<EvidenceFile> result;
    for (const auto& row : db->execSqlSync("SELECT id,original_filename,media_type,sha256,file_size,created_at FROM historical_evidence WHERE midi_id=$1 AND recovery_event_id=$2 ORDER BY id", midiId, eventId))
        result.push_back(evidenceFrom(row));
    return result;
}
std::vector<HistoricalSource> readSources(const drogon::orm::DbClientPtr& db, std::int64_t midiId) {
    std::vector<HistoricalSource> sources;
    for (const auto& row : db->execSqlSync(sourceSelect + " WHERE midi_id=$1 ORDER BY id", midiId)) {
        auto source = sourceFrom(row);
        source.evidenceFiles = sourceEvidence(db, midiId, source.id);
        sources.push_back(std::move(source));
    }
    return sources;
}
std::vector<RecoveryEvent> readEvents(const drogon::orm::DbClientPtr& db, std::int64_t midiId) {
    std::vector<RecoveryEvent> events;
    for (const auto& row : db->execSqlSync(eventSelect +
        " WHERE r.midi_id=$1 ORDER BY r.recovered_at NULLS LAST, r.id", midiId))
    {
        auto event = eventFrom(row);
        event.evidenceFiles = eventEvidence(db, midiId, event.id);
        events.push_back(std::move(event));
    }
    return events;
}
std::int64_t advanceRevision(const drogon::orm::DbClientPtr& db, std::int64_t midiId, std::int64_t revision) {
    const auto rows = db->execSqlSync(
        "UPDATE midi_entries SET updated_at=updated_at WHERE id=$1 AND revision=$2 AND deleted_at IS NULL RETURNING revision", midiId, revision);
    if (rows.empty()) {
        if (db->execSqlSync("SELECT 1 FROM midi_entries WHERE id=$1", midiId).empty())
            throw ApiError(404, "MIDI_NOT_FOUND", "MIDI entry does not exist.");
        throw ApiError(409, "STALE_ENTRY", "Entry changed elsewhere. Reload before saving.");
    }
    return rows[0]["revision"].as<std::int64_t>();
}
void requireSource(const drogon::orm::Result& rows) {
    if (rows.empty()) throw ApiError(404, "SOURCE_NOT_FOUND", "Historical source does not exist for this MIDI entry.");
}
void requireEvent(const drogon::orm::Result& rows) {
    if (rows.empty()) throw ApiError(404, "RECOVERY_EVENT_NOT_FOUND", "Recovery event does not exist for this MIDI entry.");
}
}  // namespace

std::vector<HistoricalSource> PostgresRecoveryRepository::sourcesFor(std::int64_t midiId) {
    return readSources(db_, midiId);
}
std::vector<RecoveryEvent> PostgresRecoveryRepository::eventsFor(std::int64_t midiId) {
    return readEvents(db_, midiId);
}
HistoryEditor PostgresRecoveryRepository::getHistory(std::int64_t midiId) {
    TransactionScope tx(db_);
    const auto rows = tx.db->execSqlSync("SELECT id,title,slug,revision FROM midi_entries WHERE id=$1 AND deleted_at IS NULL FOR SHARE", midiId);
    if (rows.empty()) throw ApiError(404, "MIDI_NOT_FOUND", "MIDI entry does not exist.");
    HistoryEditor result{rows[0]["id"].as<std::int64_t>(), rows[0]["title"].as<std::string>(),
        rows[0]["slug"].as<std::string>(), rows[0]["revision"].as<std::int64_t>(),
        {readSources(tx.db, midiId), readEvents(tx.db, midiId)}};
    tx.commit();
    return result;
}
SourceWriteResult PostgresRecoveryRepository::saveSource(std::int64_t midiId, std::int64_t sourceId,
    std::int64_t revision, const HistoricalSource& source) {
    TransactionScope tx(db_);
    const auto nextRevision = advanceRevision(tx.db, midiId, revision);
    const auto rows = sourceId
        ? tx.db->execSqlSync(
            "UPDATE historical_sources SET website_name=$1,original_url=NULLIF($2,''),"
            "first_seen_at=NULLIF($3,'')::timestamptz,last_seen_at=NULLIF($4,'')::timestamptz,"
            "wayback_url=NULLIF($5,''),notes=NULLIF($6,''),source_type=$7,credibility=$8,checked_at=NULLIF($9,'')::timestamptz WHERE midi_id=$10 AND id=$11 RETURNING id",
            source.websiteName, source.originalUrl.value_or(""), source.firstSeenAt.value_or(""),
            source.lastSeenAt.value_or(""), source.waybackUrl.value_or(""), source.notes.value_or(""), source.sourceType,
            static_cast<std::int16_t>(source.credibility), source.checkedAt.value_or(""), midiId, sourceId)
        : tx.db->execSqlSync(
            "INSERT INTO historical_sources(website_name,original_url,first_seen_at,last_seen_at,wayback_url,notes,midi_id,source_type,credibility,checked_at) "
            "VALUES($1,NULLIF($2,''),NULLIF($3,'')::timestamptz,NULLIF($4,'')::timestamptz,NULLIF($5,''),NULLIF($6,''),$7,$8,$9,NULLIF($10,'')::timestamptz) RETURNING id",
            source.websiteName, source.originalUrl.value_or(""), source.firstSeenAt.value_or(""),
            source.lastSeenAt.value_or(""), source.waybackUrl.value_or(""), source.notes.value_or(""), midiId,
            source.sourceType, static_cast<std::int16_t>(source.credibility), source.checkedAt.value_or(""));
    requireSource(rows);
    const auto saved = tx.db->execSqlSync(sourceSelect + " WHERE midi_id=$1 AND id=$2", midiId, rows[0]["id"].as<std::int64_t>());
    requireSource(saved);
    auto savedSource = sourceFrom(saved[0]);
    savedSource.evidenceFiles = sourceEvidence(tx.db, midiId, savedSource.id);
    SourceWriteResult result{nextRevision, std::move(savedSource)};
    tx.commit();
    return result;
}
EventWriteResult PostgresRecoveryRepository::saveEvent(std::int64_t midiId, std::int64_t eventId,
    std::int64_t revision, const RecoveryEvent& event) {
    TransactionScope tx(db_);
    const auto nextRevision = advanceRevision(tx.db, midiId, revision);
    auto recoveredByName = event.recoveredByName;
    if (event.recoveredBy && !recoveredByName) {
        const auto person = tx.db->execSqlSync("SELECT display_name FROM people WHERE id=$1", *event.recoveredBy);
        if (person.empty()) throw ApiError(400, "UNKNOWN_PERSON", "The legacy recovered_by person does not exist.");
        recoveredByName = person[0]["display_name"].as<std::string>();
    }
    // New recovery records keep a stable name snapshot, not a live person FK.
    if (eventId)
        requireEvent(tx.db->execSqlSync("SELECT id FROM recovery_events WHERE midi_id=$1 AND id=$2", midiId, eventId));
    const auto rows = eventId
        ? tx.db->execSqlSync(
            "UPDATE recovery_events SET recovered_at=NULLIF($1,'')::timestamptz,recovered_by=NULL,recovered_by_name=NULLIF($2,''),"
            "story=$3,evidence=NULLIF($4,'') WHERE midi_id=$5 AND id=$6 RETURNING id",
            event.recoveredAt.value_or(""), recoveredByName.value_or(""), event.story, event.evidence.value_or(""), midiId, eventId)
        : tx.db->execSqlSync(
            "INSERT INTO recovery_events(recovered_at,recovered_by,recovered_by_name,story,evidence,midi_id) "
            "VALUES(NULLIF($1,'')::timestamptz,NULLIF($2::bigint,0),NULLIF($3,''),$4,NULLIF($5,''),$6) RETURNING id",
            event.recoveredAt.value_or(""), 0, recoveredByName.value_or(""), event.story, event.evidence.value_or(""), midiId);
    requireEvent(rows);
    const auto saved = tx.db->execSqlSync(eventSelect + " WHERE r.midi_id=$1 AND r.id=$2", midiId, rows[0]["id"].as<std::int64_t>());
    requireEvent(saved);
    auto savedEvent = eventFrom(saved[0]);
    savedEvent.evidenceFiles = eventEvidence(tx.db, midiId, savedEvent.id);
    EventWriteResult result{nextRevision, std::move(savedEvent)};
    tx.commit();
    return result;
}
DeleteResult PostgresRecoveryRepository::deleteSource(std::int64_t midiId, std::int64_t sourceId, std::int64_t revision) {
    TransactionScope tx(db_);
    const auto nextRevision = advanceRevision(tx.db, midiId, revision);
    requireSource(tx.db->execSqlSync("DELETE FROM historical_sources WHERE midi_id=$1 AND id=$2 RETURNING id", midiId, sourceId));
    tx.commit();
    return {nextRevision, sourceId};
}
DeleteResult PostgresRecoveryRepository::deleteEvent(std::int64_t midiId, std::int64_t eventId, std::int64_t revision) {
    TransactionScope tx(db_);
    const auto nextRevision = advanceRevision(tx.db, midiId, revision);
    requireEvent(tx.db->execSqlSync("DELETE FROM recovery_events WHERE midi_id=$1 AND id=$2 RETURNING id", midiId, eventId));
    tx.commit();
    return {nextRevision, eventId};
}
}  // namespace lostmidi::recovery
