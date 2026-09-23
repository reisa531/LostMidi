#include "midi/PostgresMidiRepository.h"
#include "common/Transaction.h"

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
        nullable<std::string>(row["discovered_at"]), row["created_at"].as<std::string>(),
        row["private_archive_confirmed"].as<bool>()};
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
MidiEntry PostgresMidiRepository::createWithRequest(const MidiEntry& e, const std::string& requestId,
    const std::string& payloadSha256, const std::optional<MidiFile>& file, const std::function<void()>& persist) {
    // Commit the journal separately so a failed creation cannot hide an orphaned object.
    if (file) db_->execSqlSync("INSERT INTO midi_import_objects(sha256,storage_key) VALUES($1,$2) "
        "ON CONFLICT(sha256) DO UPDATE SET touched_at=CURRENT_TIMESTAMP", file->sha256, file->storageKey);
    TransactionScope tx(db_);
    tx.db->execSqlSync("SET LOCAL lock_timeout = '5s'");
    // Request locks use a separate namespace; all paths take request then SHA.
    tx.db->execSqlSync("SELECT pg_advisory_xact_lock(hashtextextended($1,741034))", requestId);
    if (file) tx.db->execSqlSync("SELECT pg_advisory_xact_lock(hashtextextended($1,741033))", file->sha256);
    const auto receipts = tx.db->execSqlSync(
        "SELECT e.*,r.payload_sha256 FROM midi_creation_requests r JOIN midi_entries e ON e.id=r.midi_id "
        "WHERE r.request_id=$1::uuid FOR SHARE OF e", requestId);
    if (!receipts.empty()) {
        if (receipts[0]["payload_sha256"].as<std::string>() != payloadSha256)
            throw ApiError(409, "IDEMPOTENCY_CONFLICT", "This request_id was already used with a different payload.");
        const auto saved = entryFrom(receipts[0]);
        // A replay never writes storage or repairs/re-adds files. Only discard a
        // journal while its exact object is referenced, under the shared SHA lock.
        if (file) tx.db->execSqlSync("DELETE FROM midi_import_objects WHERE sha256=$1 AND storage_key=$2 "
            "AND EXISTS(SELECT 1 FROM midi_files WHERE sha256=$1 AND storage_key=$2)", file->sha256, file->storageKey);
        tx.commit(); return saved;
    }
    if (file && !tx.db->execSqlSync("SELECT 1 FROM midi_files WHERE sha256=$1", file->sha256).empty())
        throw ApiError(409, "FILE_OWNERSHIP_CONFLICT", "Identical bytes already belong to another MIDI entry.");
    const auto entries = tx.db->execSqlSync(
        "INSERT INTO midi_entries (slug,title,description,estimated_year,archive_status,copyright_status,license,rights_holder,distribution_permission) "
        "VALUES ($1,$2,NULLIF($3,''),NULLIF($4,0)::smallint,$5,$6,NULLIF($7,''),NULLIF($8,''),$9) ON CONFLICT(slug) DO NOTHING RETURNING *",
        e.slug, e.title, e.description.value_or(""), e.estimatedYear.value_or(0), e.archiveStatus,
        *e.copyrightStatus, e.license.value_or(""), e.rightsHolder.value_or(""), *e.distributionPermission);
    if (entries.empty()) throw ApiError(409, "SLUG_CONFLICT", "This slug is already in use.");
    const auto saved = entryFrom(entries[0]);
    if (file) {
        if (tx.db->execSqlSync("SELECT 1 FROM midi_import_objects WHERE sha256=$1 AND storage_key=$2 FOR UPDATE", file->sha256, file->storageKey).empty())
            throw ApiError(503, "SERVER_BUSY", "Import was superseded. Retry the same request.");
        persist();
        // Retain the deployed legacy column name for public-distribution consent.
        const auto inserted = tx.db->execSqlSync(
            "INSERT INTO midi_files(midi_id,original_filename,sha256,file_size,storage_key,private_archive_confirmed) "
            "VALUES($1,$2,$3,$4,$5,TRUE) ON CONFLICT(sha256) DO NOTHING RETURNING id",
            saved.id, file->originalFilename, file->sha256, static_cast<std::int64_t>(file->fileSize), file->storageKey);
        if (inserted.empty()) throw ApiError(409, "FILE_OWNERSHIP_CONFLICT", "Identical bytes were registered concurrently. Retry after refreshing.");
    }
    tx.db->execSqlSync("INSERT INTO midi_creation_requests(request_id,payload_sha256,midi_id) VALUES($1::uuid,$2,$3)", requestId, payloadSha256, saved.id);
    if (file) tx.db->execSqlSync("DELETE FROM midi_import_objects WHERE sha256=$1", file->sha256);
    // One creation, including the optional file, starts at revision 1. Neither
    // archive status nor rights metadata is inferred from the supplied file.
    tx.commit(); return saved;
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
FileEditor PostgresMidiRepository::fileEditor(std::int64_t id) {
    TransactionScope tx(db_);
    const auto rows = tx.db->execSqlSync("SELECT * FROM midi_entries WHERE id=$1 FOR SHARE", id);
    if (rows.empty()) throw ApiError(404, "MIDI_NOT_FOUND", "The requested MIDI entry does not exist.");
    FileEditor result{entryFrom(rows[0]), {}};
    for (const auto& row : tx.db->execSqlSync("SELECT * FROM midi_files WHERE midi_id=$1 ORDER BY id", id)) result.files.push_back(fileFrom(row));
    tx.commit(); return result;
}
FileImportResult PostgresMidiRepository::importFile(const MidiFile& file, std::int64_t revision, const std::function<void()>& persist) {
    // Commit the journal separately, BEFORE touching external storage. A failed
    // transaction must not hide its potentially orphaned object from cleanup.
    db_->execSqlSync("INSERT INTO midi_import_objects(sha256,storage_key) VALUES($1,$2) "
        "ON CONFLICT(sha256) DO UPDATE SET touched_at=CURRENT_TIMESTAMP", file.sha256, file.storageKey);
    TransactionScope tx(db_);
    tx.db->execSqlSync("SET LOCAL lock_timeout = '5s'");
    // A stable 64-bit PostgreSQL hash is sufficient: collisions only serialize
    // unrelated imports, never merge their records. Cleanup uses the same lock.
    tx.db->execSqlSync("SELECT pg_advisory_xact_lock(hashtextextended($1,741033))", file.sha256);
    const auto parents = tx.db->execSqlSync("SELECT * FROM midi_entries WHERE id=$1 FOR UPDATE", file.midiId);
    if (parents.empty()) throw ApiError(404, "MIDI_NOT_FOUND", "The requested MIDI entry does not exist.");
    const auto parent = entryFrom(parents[0]);
    const auto existing = tx.db->execSqlSync("SELECT * FROM midi_files WHERE sha256=$1", file.sha256);
    if (!existing.empty()) {
        const auto saved = fileFrom(existing[0]);
        if (saved.midiId != file.midiId) throw ApiError(409, "FILE_OWNERSHIP_CONFLICT", "Identical bytes already belong to another MIDI entry.");
        if (saved.storageKey != file.storageKey) throw ApiError(503, "STORAGE_UNAVAILABLE", "Stored object identity requires maintenance.");
        persist(); // Safe retry/repair; never alters attribution, rights or revision.
        tx.db->execSqlSync("DELETE FROM midi_import_objects WHERE sha256=$1", file.sha256);
        tx.commit(); return {saved, true, parent.revision};
    }
    if (parent.revision != revision) throw ApiError(409, "STALE_ENTRY", "This entry was changed elsewhere. Reload before importing.");
    if (tx.db->execSqlSync("SELECT 1 FROM midi_import_objects WHERE sha256=$1 FOR UPDATE", file.sha256).empty())
        throw ApiError(503, "SERVER_BUSY", "Import was superseded. Retry after refreshing.");
    persist();
    // Keep the legacy column name for public-distribution consent without rewriting deployed migrations.
    const auto inserted = tx.db->execSqlSync(
        "INSERT INTO midi_files(midi_id,original_filename,sha256,file_size,storage_key,private_archive_confirmed) "
        "VALUES($1,$2,$3,$4,$5,TRUE) ON CONFLICT(sha256) DO NOTHING RETURNING *",
        file.midiId, file.originalFilename, file.sha256, static_cast<std::int64_t>(file.fileSize), file.storageKey);
    if (inserted.empty()) throw ApiError(409, "FILE_OWNERSHIP_CONFLICT", "Identical bytes were registered concurrently. Refresh before retrying.");
    const auto rows = tx.db->execSqlSync("UPDATE midi_entries SET updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND revision=$2 RETURNING revision", file.midiId, revision);
    if (rows.empty()) throw ApiError(409, "STALE_ENTRY", "This entry was changed elsewhere. Reload before importing.");
    const auto newRevision = rows[0]["revision"].as<std::int64_t>();
    const auto saved = fileFrom(inserted[0]);
    tx.db->execSqlSync("DELETE FROM midi_import_objects WHERE sha256=$1", file.sha256);
    tx.commit(); return {saved, false, newRevision};
}
std::size_t PostgresMidiRepository::cleanupImports(const std::function<void(const std::string&)>& remove) {
    // Explicit maintenance only, at most 100 tracked objects older than 24h.
    // Never lists or sweeps unrelated bucket objects, nor deletes committed files.
    const auto candidates = db_->execSqlSync("SELECT sha256 FROM midi_import_objects WHERE touched_at < CURRENT_TIMESTAMP - INTERVAL '24 hours' ORDER BY touched_at LIMIT 100");
    std::size_t removed = 0;
    for (const auto& candidate : candidates) {
        const auto digest = candidate["sha256"].as<std::string>();
        TransactionScope tx(db_);
        const auto locked = tx.db->execSqlSync("SELECT pg_try_advisory_xact_lock(hashtextextended($1,741033)) AS locked", digest);
        if (!locked[0]["locked"].as<bool>()) continue;
        const auto pending = tx.db->execSqlSync("SELECT storage_key FROM midi_import_objects WHERE sha256=$1 AND touched_at < CURRENT_TIMESTAMP - INTERVAL '24 hours' FOR UPDATE", digest);
        if (pending.empty()) continue; // A retry refreshed it since candidate selection.
        const auto referenced = tx.db->execSqlSync("SELECT 1 FROM midi_files WHERE sha256=$1 OR storage_key=$2", digest, pending[0]["storage_key"].as<std::string>());
        if (referenced.empty()) { remove(pending[0]["storage_key"].as<std::string>()); ++removed; }
        tx.db->execSqlSync("DELETE FROM midi_import_objects WHERE sha256=$1", digest);
        tx.commit();
    }
    return removed;
}
}  // namespace lostmidi::midi
