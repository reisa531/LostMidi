#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
    echo 'Usage: RESTORE_REHEARSAL_CONFIRM=disposable PGHOST=... PGDATABASE=... PGUSER=... database/restore-rehearsal.sh backup.dump' >&2
    exit 2
fi
if [ "${RESTORE_REHEARSAL_CONFIRM:-}" != disposable ]; then
    echo 'Refusing restore rehearsal without RESTORE_REHEARSAL_CONFIRM=disposable.' >&2
    exit 2
fi
if [ -z "${PGDATABASE:-}" ] || [ -z "${PGHOST:-}" ] || [ -z "${PGUSER:-}" ]; then
    echo 'PGHOST, PGDATABASE and PGUSER must point to a fresh, isolated restore database.' >&2
    exit 2
fi
for command in pg_restore psql; do
    command -v "$command" >/dev/null 2>&1 || { echo "$command is required." >&2; exit 2; }
done
archive=$1
[ -f "$archive" ] || { echo 'Backup archive does not exist.' >&2; exit 2; }

# Require an unmistakably disposable database name and refuse to touch any
# database that already contains user tables. Credentials are never printed.
database_name=$(psql -X --no-psqlrc --tuples-only --no-align --command='SELECT current_database()')
case "$database_name" in *_restore_check|*_restore_rehearsal) ;; *)
    echo 'The target database name must end in _restore_check or _restore_rehearsal.' >&2
    exit 2 ;;
esac
table_count=$(psql -X --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%'")
[ "$table_count" = 0 ] || { echo 'The target database is not empty; refusing to overwrite it.' >&2; exit 2; }
pg_restore --list "$archive" >/dev/null
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --dbname="$PGDATABASE" "$archive"

schema_ok=$(psql -X --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="SELECT to_regclass('public.midi_entries') IS NOT NULL AND to_regclass('public.people') IS NOT NULL AND to_regclass('public.midi_files') IS NOT NULL AND to_regclass('public.site_installation') IS NOT NULL")
[ "$schema_ok" = t ] || { echo 'Restore completed without all expected archive tables.' >&2; exit 1; }
psql -X --no-psqlrc --set=ON_ERROR_STOP=1 --command="SELECT 'midi_entries' AS table_name,count(*) FROM midi_entries UNION ALL SELECT 'people',count(*) FROM people UNION ALL SELECT 'midi_files',count(*) FROM midi_files ORDER BY table_name"
psql -X --no-psqlrc --set=ON_ERROR_STOP=1 --command="SELECT max(version) AS latest_migration FROM schema_migrations"
echo 'Database restore rehearsal completed. File/object storage is not included in a PostgreSQL dump.'
