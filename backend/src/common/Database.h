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
    const auto deletion = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='008_deleted_creation_receipts.sql') AS applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='midi_creation_requests'::regclass "
        "AND attname='midi_id' AND attnum>0 AND NOT attisdropped AND NOT attnotnull) AS nullable_id, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='midi_creation_requests'::regclass "
        "AND conname='midi_creation_requests_midi_id_fkey' AND confrelid='midi_entries'::regclass AND confdeltype='n') AS retained");
    if (!deletion[0]["applied"].as<bool>() || !deletion[0]["nullable_id"].as<bool>() || !deletion[0]["retained"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required deletion migration is not applied.");
    const auto search = db->execSqlSync("SELECT 1 FROM schema_migrations WHERE version='009_catalog_search.sql'");
    if (search.empty()) throw ApiError(503, "DATABASE_NOT_READY", "Required catalog search migration is not applied.");
    const auto recovery = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='010_recoverable_deletions.sql') AS applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='midi_entries'::regclass AND attname='deleted_at' AND attnum>0 AND NOT attisdropped) AS midi_trash, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='people'::regclass AND attname='deleted_at' AND attnum>0 AND NOT attisdropped) AS people_trash, "
        "to_regclass('admin_audit_log') IS NOT NULL AS audit_log");
    if (!recovery[0]["applied"].as<bool>() || !recovery[0]["midi_trash"].as<bool>() ||
        !recovery[0]["people_trash"].as<bool>() || !recovery[0]["audit_log"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required recoverable deletion migration is not applied.");
    const auto cleanup = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='011_cleanup_retry_metadata.sql') AS applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='midi_import_objects'::regclass AND attname='cleanup_attempts' AND attnum>0 AND NOT attisdropped) AS attempts, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='midi_import_objects'::regclass AND attname='last_cleanup_attempt_at' AND attnum>0 AND NOT attisdropped) AS last_attempt");
    if (!cleanup[0]["applied"].as<bool>() || !cleanup[0]["attempts"].as<bool>() || !cleanup[0]["last_attempt"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required cleanup retry migration is not applied.");
    const auto rows = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='004_optional_recovery_date.sql') AS applied, "
        "EXISTS(SELECT 1 FROM schema_migrations WHERE version='005_site_installation.sql') AS installation_applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='recovery_events'::regclass "
        "AND attname='recovered_at' AND attnum>0 AND NOT attisdropped AND NOT attnotnull) AS nullable_date");
    if (!rows[0]["applied"].as<bool>() || !rows[0]["installation_applied"].as<bool>() || !rows[0]["nullable_date"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required database migrations are not applied.");
}
}  // namespace lostmidi
