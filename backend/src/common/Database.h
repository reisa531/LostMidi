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
    const auto rows = db->execSqlSync(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='004_optional_recovery_date.sql') AS applied, "
        "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='recovery_events'::regclass "
        "AND attname='recovered_at' AND attnum>0 AND NOT attisdropped AND NOT attnotnull) AS nullable_date");
    if (!rows[0]["applied"].as<bool>() || !rows[0]["nullable_date"].as<bool>())
        throw ApiError(503, "DATABASE_NOT_READY", "Required recovery schema migration is not applied.");
}
}  // namespace lostmidi
