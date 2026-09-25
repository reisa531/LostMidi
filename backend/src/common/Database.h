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
    const auto evidence = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='012_source_evidence.sql') AS applied, "
        "to_regclass('historical_evidence') IS NOT NULL AS evidence_table, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='historical_sources'::regclass "
        "AND attname='credibility' AND attnum>0 AND NOT attisdropped) AS credibility");
    if (!evidence[0]["applied"].as<bool>() || !evidence[0]["evidence_table"].as<bool>() || !evidence[0]["credibility"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required source evidence migration is not applied.");
    const auto users = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='013_admin_users.sql') AS applied, "
        "to_regclass('admin_users') IS NOT NULL AS accounts, to_regclass('admin_invitations') IS NOT NULL AS invitations");
    if (!users[0]["applied"].as<bool>() || !users[0]["accounts"].as<bool>() || !users[0]["invitations"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required administrator accounts migration is not applied.");
    const auto publicIds = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='014_public_ids.sql') AS applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='midi_entries'::regclass AND attname='public_id' AND attnum>0 AND NOT attisdropped) AS midi_id, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='people'::regclass AND attname='public_id' AND attnum>0 AND NOT attisdropped) AS person_id");
    if (!publicIds[0]["applied"].as<bool>() || !publicIds[0]["midi_id"].as<bool>() || !publicIds[0]["person_id"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required public identifier migration is not applied.");
    const auto reviews = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='015_content_reviews.sql') AS applied, "
        "to_regclass('admin_change_requests') IS NOT NULL AS requests");
    db->execSqlSync("SELECT id FROM admin_change_requests LIMIT 1");
    if (!reviews[0]["applied"].as<bool>() || !reviews[0]["requests"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required content review migration is not applied.");
    const auto rows = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='004_optional_recovery_date.sql') AS applied, "
        "EXISTS(SELECT 1 FROM schema_migrations WHERE version='005_site_installation.sql') AS installation_applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='recovery_events'::regclass "
        "AND attname='recovered_at' AND attnum>0 AND NOT attisdropped AND NOT attnotnull) AS nullable_date");
    if (!rows[0]["applied"].as<bool>() || !rows[0]["installation_applied"].as<bool>() || !rows[0]["nullable_date"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required database migrations are not applied.");
    const auto profile = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='016_profile_and_estimated_date.sql') AS applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='midi_entries'::regclass AND attname='estimated_date' AND attnum>0 AND NOT attisdropped) AS estimated_date, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='people'::regclass AND attname='profile' AND attnum>0 AND NOT attisdropped) AS profile, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='recovery_events'::regclass AND attname='recovered_by_name' AND attnum>0 AND NOT attisdropped) AS recovered_by_name");
    if (!profile[0]["applied"].as<bool>() || !profile[0]["estimated_date"].as<bool>() || !profile[0]["profile"].as<bool>() || !profile[0]["recovered_by_name"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required profile and date migration is not applied.");
    const auto sourceTypes = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='017_multiple_source_types.sql') AS multiple, "
        "EXISTS(SELECT 1 FROM schema_migrations WHERE version='018_freeform_source_type_labels.sql') AS freeform");
    if (!sourceTypes[0]["multiple"].as<bool>() || !sourceTypes[0]["freeform"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required source type migrations are not applied.");
    const auto accountAndStatus = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='019_archive_status_and_registration.sql') AS applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='admin_users'::regclass AND attname='email' AND NOT attisdropped) AS email, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='admin_change_requests'::regclass AND attname='entity_public_id' AND NOT attisdropped) AS stable_review, "
        "to_regprocedure('allocate_archive_id(text)') IS NOT NULL AS allocator");
    if (!accountAndStatus[0]["applied"].as<bool>() || !accountAndStatus[0]["email"].as<bool>() ||
        !accountAndStatus[0]["stable_review"].as<bool>() || !accountAndStatus[0]["allocator"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required archive and account migration is not applied.");
    const auto articles = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='020_articles.sql') AS applied, "
        "to_regclass('articles') IS NOT NULL AS articles, "
        "to_regclass('article_midis') IS NOT NULL AS midis, "
        "to_regclass('article_people') IS NOT NULL AS people");
    if (!articles[0]["applied"].as<bool>() || !articles[0]["articles"].as<bool>() ||
        !articles[0]["midis"].as<bool>() || !articles[0]["people"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required articles migration is not applied.");
}
}  // namespace lostmidi
