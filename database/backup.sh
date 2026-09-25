#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
    echo 'Usage: database/backup.sh BACKUP_ROOT [LOCAL_STORAGE_DIR]' >&2
    exit 2
fi
command -v pg_dump >/dev/null 2>&1 || { echo 'pg_dump is required.' >&2; exit 2; }
if command -v sha256sum >/dev/null 2>&1; then checksum_tool=sha256sum
elif command -v shasum >/dev/null 2>&1; then checksum_tool=shasum
else echo 'sha256sum or shasum is required.' >&2; exit 2
fi

umask 077
backup_root=$1
mkdir -p -- "$backup_root"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=$backup_root/$stamp
if [ -e "$backup_dir" ]; then echo 'A backup with this timestamp already exists.' >&2; exit 2; fi
mkdir -m 700 -- "$backup_dir"
trap 'rm -f -- "$backup_dir/database.dump.partial"' EXIT HUP INT TERM

# libpq environment variables keep connection credentials out of command arguments.
pg_dump --format=custom --no-owner --no-privileges --file="$backup_dir/database.dump.partial"
mv -- "$backup_dir/database.dump.partial" "$backup_dir/database.dump"
files=database.dump
if [ "$#" -eq 2 ]; then
    storage_dir=$2
    [ -d "$storage_dir" ] || { echo 'The local storage directory does not exist.' >&2; exit 2; }
    tar -czf "$backup_dir/local-storage.tar.gz" -C "$storage_dir" .
    files="$files local-storage.tar.gz"
fi
if command -v git >/dev/null 2>&1; then
    script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
    git -C "$script_dir/.." rev-parse HEAD > "$backup_dir/commit.txt"
fi
if [ "$checksum_tool" = sha256sum ]; then
    (cd "$backup_dir" && sha256sum $files) > "$backup_dir/SHA256SUMS"
else
    (cd "$backup_dir" && shasum -a 256 $files) > "$backup_dir/SHA256SUMS"
fi
chmod 600 "$backup_dir"/*
echo "Backup created at $backup_dir"
