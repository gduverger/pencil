#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh into DATABASE_URL, which must be an empty database
# (or one you are willing to overwrite: existing objects are dropped first).
#   DATABASE_URL=postgres://… scripts/restore.sh backups/pencil-2026-11-04.dump
set -euo pipefail
DUMP=${1:?usage: restore.sh <dump file> (with DATABASE_URL set)}
: "${DATABASE_URL:?DATABASE_URL is required}"
pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error --dbname="$DATABASE_URL" "$DUMP"
echo "restored $DUMP into the database"
