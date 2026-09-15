#include "midi/PostgresMidiRepository.h"

namespace lostmidi::midi {
namespace {
MidiEntry entryFrom(const drogon::orm::Row& row) {
    return {row["id"].as<std::int64_t>(), row["slug"].as<std::string>(),
        row["title"].as<std::string>(), nullable<std::string>(row["description"]),
        nullable<int>(row["estimated_year"]), row["archive_status"].as<std::string>(),
        row["created_at"].as<std::string>(), row["updated_at"].as<std::string>(),
        nullable<std::string>(row["copyright_status"]), nullable<std::string>(row["license"]),
        nullable<std::string>(row["rights_holder"]), nullable<std::string>(row["distribution_permission"]), row["revision"].as<std::int64_t>()};
}
MidiFile fileFrom(const drogon::orm::Row& row) {
    return {row["id"].as<std::int64_t>(), row["midi_id"].as<std::int64_t>(),
        row["original_filename"].as<std::string>(), row["sha256"].as<std::string>(),
        row["file_size"].as<std::uint64_t>(), row["storage_key"].as<std::string>(),
        nullable<std::string>(row["discovered_at"]), row["created_at"].as<std::string>()};
}
}
std::vector<MidiEntry> PostgresMidiRepository::list(Page page) {
    std::vector<MidiEntry> entries;
    for (const auto& row : db_->execSqlSync("SELECT * FROM midi_entries ORDER BY id LIMIT $1 OFFSET $2", static_cast<std::int64_t>(page.size), page.offset()))
        entries.push_back(entryFrom(row));
    return entries;
}
std::int64_t PostgresMidiRepository::count() {
    return db_->execSqlSync("SELECT count(*) AS total FROM midi_entries")[0]["total"].as<std::int64_t>();
}
std::optional<MidiEntry> PostgresMidiRepository::findBySlug(const std::string& slug) {
    const auto rows = db_->execSqlSync("SELECT * FROM midi_entries WHERE slug = $1", slug);
    if (rows.empty()) return std::nullopt;
    return entryFrom(rows[0]);
}
std::vector<MidiFile> PostgresMidiRepository::filesFor(std::int64_t midiId) {
    std::vector<MidiFile> files;
    for (const auto& row : db_->execSqlSync("SELECT * FROM midi_files WHERE midi_id = $1 ORDER BY id", midiId))
        files.push_back(fileFrom(row));
    return files;
}
std::optional<MidiFile> PostgresMidiRepository::findBySha256(const std::string& digest) {
    const auto rows = db_->execSqlSync("SELECT * FROM midi_files WHERE sha256 = $1", digest);
    if (rows.empty()) return std::nullopt;
    return fileFrom(rows[0]);
}
bool PostgresMidiRepository::insertIfAbsent(const MidiFile& file) {
    return !db_->execSqlSync(
        "INSERT INTO midi_files (midi_id, original_filename, sha256, file_size, storage_key) "
        "VALUES ($1, $2, $3, $4, $5) ON CONFLICT (sha256) DO NOTHING RETURNING id",
        file.midiId, file.originalFilename, file.sha256, file.fileSize, file.storageKey).empty();
}
std::optional<MidiEntry> PostgresMidiRepository::findById(std::int64_t id) {
    const auto rows = db_->execSqlSync("SELECT * FROM midi_entries WHERE id = $1", id);
    if (rows.empty()) return std::nullopt;
    return entryFrom(rows[0]);
}
MidiEntry PostgresMidiRepository::create(const MidiEntry& e) {
    const auto rows = db_->execSqlSync(
        "INSERT INTO midi_entries (slug,title,description,estimated_year,archive_status,copyright_status,license,rights_holder,distribution_permission) "
        "VALUES ($1,$2,NULLIF($3,''),NULLIF($4,0)::smallint,$5,$6,NULLIF($7,''),NULLIF($8,''),$9) ON CONFLICT(slug) DO NOTHING RETURNING *",
        e.slug, e.title, e.description.value_or(""), e.estimatedYear.value_or(0), e.archiveStatus,
        *e.copyrightStatus, e.license.value_or(""), e.rightsHolder.value_or(""), *e.distributionPermission);
    if (rows.empty()) throw ApiError(409, "SLUG_CONFLICT", "This slug is already in use.");
    return entryFrom(rows[0]);
}
MidiEntry PostgresMidiRepository::update(std::int64_t id, const MidiEntry& e) {
    try {
        const auto rows = db_->execSqlSync(
            "UPDATE midi_entries SET slug=$1,title=$2,description=NULLIF($3,''),estimated_year=NULLIF($4,0)::smallint,archive_status=$5,"
            "copyright_status=$6,license=NULLIF($7,''),rights_holder=NULLIF($8,''),distribution_permission=$9 WHERE id=$10 AND revision=$11 RETURNING *",
            e.slug, e.title, e.description.value_or(""), e.estimatedYear.value_or(0), e.archiveStatus,
            *e.copyrightStatus, e.license.value_or(""), e.rightsHolder.value_or(""), *e.distributionPermission, id, e.revision);
        if (!rows.empty()) return entryFrom(rows[0]);
    } catch (const drogon::orm::Failure& error) {
        const auto* sqlError = dynamic_cast<const drogon::orm::SqlError*>(&error);
        if (sqlError && !sqlError->sqlState().empty() && sqlError->sqlState() != "23505") throw;
        // Some Drogon PostgreSQL builds expose only Failure, without SQLSTATE.
        // Confirm the conflicting record instead of parsing localized error text.
        if (!db_->execSqlSync("SELECT 1 FROM midi_entries WHERE slug=$1 AND id<>$2", e.slug, id).empty())
            throw ApiError(409, "SLUG_CONFLICT", "This slug is already in use.");
        throw;
    }
    if (!findById(id)) throw ApiError(404, "MIDI_NOT_FOUND", "The requested MIDI entry does not exist.");
    throw ApiError(409, "STALE_ENTRY", "This entry was changed elsewhere. Reload before saving.");
}
}  // namespace lostmidi::midi
