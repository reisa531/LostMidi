#pragma once
#include <drogon/orm/DbClient.h>
#include <optional>
#include "common/Error.h"

namespace lostmidi {
template <typename T>
std::optional<T> nullable(const drogon::orm::Field& field) {
    return field.isNull() ? std::nullopt : std::optional<T>(field.as<T>());
}
// Shared by startup and /ready. Verify the migration ledger AND the actual schema;
// checking metadata never writes probe records or changes the database.
inline void requireDatabaseReady(const drogon::orm::DbClientPtr& db) {
    db->execSqlSync("SELECT revision FROM midi_entries LIMIT 1");
    db->execSqlSync("SELECT revision FROM people LIMIT 1");
    db->execSqlSync("SELECT token_hash FROM admin_sessions LIMIT 1");
    db->execSqlSync("SELECT id, site_name, site_description, auth_source, username, password_hash, installed_at FROM site_installation LIMIT 1");
    db->execSqlSync("SELECT sha256, storage_key, touched_at FROM midi_import_objects LIMIT 1");
    db->execSqlSync("SELECT private_archive_confirmed FROM midi_files LIMIT 1");
    db->execSqlSync("SELECT request_id, payload_sha256, midi_id FROM midi_creation_requests LIMIT 1");
    const auto imported = db->execSqlSync("SELECT 1 FROM schema_migrations WHERE version='006_midi_import_journal.sql'");
    if (imported.empty()) throw ApiError(503, "DATABASE_NOT_READY", "Required import migration is not applied.");
    const auto creation = db->execSqlSync("SELECT 1 FROM schema_migrations WHERE version='007_midi_creation_requests.sql'");
    if (creation.empty()) throw ApiError(503, "DATABASE_NOT_READY", "Required creation migration is not applied.");
    const auto rows = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='004_optional_recovery_date.sql') AS applied, "
        "EXISTS(SELECT 1 FROM schema_migrations WHERE version='005_site_installation.sql') AS installation_applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='recovery_events'::regclass "
        "AND attname='recovered_at' AND attnum>0 AND NOT attisdropped AND NOT attnotnull) AS nullable_date");
    if (!rows[0]["applied"].as<bool>() || !rows[0]["installation_applied"].as<bool>() || !rows[0]["nullable_date"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required database migrations are not applied.");
}
}  // namespace lostmidi
