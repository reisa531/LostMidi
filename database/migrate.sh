#!/bin/sh
# Uses libpq's PGHOST, PGPORT, PGDATABASE, PGUSER and PGPASSWORD variables.
# DATABASE_URL is an optional alternative. Never print connection credentials.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
seed_demo=${SEED_DEMO:-false}
case "$seed_demo" in true|false) ;; *) echo 'SEED_DEMO must be true or false.' >&2; exit 1 ;; esac
command -v psql >/dev/null 2>&1 || { echo 'psql is required.' >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
    checksum_tool=sha256sum
elif command -v shasum >/dev/null 2>&1; then
    checksum_tool=shasum
else
    echo 'sha256sum or shasum is required.' >&2
    exit 1
fi

sql_file=$(mktemp)
trap 'rm -f -- "$sql_file"' EXIT HUP INT TERM

cat > "$sql_file" <<'SQL'
BEGIN;
SET LOCAL client_min_messages = warning;
SET LOCAL TIME ZONE 'UTC';
-- Serializes concurrent runners on the same database for this transaction.
DO $$ BEGIN PERFORM pg_advisory_xact_lock(741032, 1); END $$;
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS schema_seed_history (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION pg_temp.verify_migration_checksum(actual TEXT, expected TEXT, filename TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF actual <> expected THEN
        RAISE EXCEPTION 'Applied SQL file % has changed. Restore it and add a new migration.', filename;
    END IF;
END;
$$;
SQL

append_scripts() {
    source_dir=$1
    history_table=$2
    for migration_file in "$source_dir"/*.sql; do
        [ -f "$migration_file" ] || continue
        migration_name=${migration_file##*/}
        # Restrict identifiers before writing them into the generated SQL script.
        case "$migration_name" in
            *[!a-z0-9_.]* ) echo "Invalid SQL filename: $migration_name" >&2; exit 1 ;;
        esac
        case "$migration_name" in
            [0-9][0-9][0-9]_*.sql) ;;
            *) echo "Expected NNN_description.sql: $migration_name" >&2; exit 1 ;;
        esac
        if [ "$checksum_tool" = sha256sum ]; then
            checksum_output=$(sha256sum "$migration_file")
        else
            checksum_output=$(shasum -a 256 "$migration_file")
        fi
        checksum=${checksum_output%% *}
        printf "SELECT pg_temp.verify_migration_checksum(checksum, '%s', '%s') FROM %s WHERE version = '%s';\n" \
            "$checksum" "$migration_name" "$history_table" "$migration_name" >> "$sql_file"
        printf "SELECT NOT EXISTS (SELECT 1 FROM %s WHERE version = '%s') AS apply_file \\gset\n" \
            "$history_table" "$migration_name" >> "$sql_file"
        printf '\\if :apply_file\n\\echo Applying %s\n' "$migration_name" >> "$sql_file"
        cat "$migration_file" >> "$sql_file"
        printf "\nINSERT INTO %s (version, checksum) VALUES ('%s', '%s');\n" \
            "$history_table" "$migration_name" "$checksum" >> "$sql_file"
        printf '\\else\n\\echo Already applied: %s\n\\endif\n' "$migration_name" >> "$sql_file"
    done
}

# Zero-padded filenames have deterministic order even across host locales.
LC_ALL=C
export LC_ALL
append_scripts "$script_dir/migrations" schema_migrations
if [ "$seed_demo" = true ]; then
    append_scripts "$script_dir/seeds" schema_seed_history
fi
printf 'COMMIT;\n' >> "$sql_file"

if [ -n "${DATABASE_URL:-}" ]; then
    psql -X --set=ON_ERROR_STOP=1 --file="$sql_file" "$DATABASE_URL"
else
    psql -X --set=ON_ERROR_STOP=1 --file="$sql_file"
fi
