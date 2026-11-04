#!/usr/bin/env bash
# Restore drill (spec 14.1 "restore drill once before launch"): start a scratch PostgreSQL cluster,
# run Pencil's migrations into it, write an organization and a deal, back the database up with
# scripts/backup.sh, destroy the database, restore it with scripts/restore.sh and verify the deal
# came back. Needs PostgreSQL server binaries (initdb, pg_ctl) and pnpm; takes about a minute.
#   scripts/restore-drill.sh            # prints PASS or FAIL
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PGBIN=${PGBIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}
PORT=${DRILL_PORT:-54329}
WORK=${DRILL_DIR:-$(mktemp -d)}
PGUSER=pencil
# initdb refuses to run as root; hand the cluster to the postgres system user in that case.
if [ "$(id -u)" = "0" ]; then
  chown postgres "$WORK"
  AS_PG=(runuser -u postgres --)
else
  AS_PG=()
fi
echo "cluster: $WORK (PostgreSQL binaries in $PGBIN)"
"${AS_PG[@]}" "$PGBIN/initdb" -D "$WORK/cluster" -U "$PGUSER" --auth=trust -E UTF8 >"$WORK/initdb.log" 2>&1
"${AS_PG[@]}" "$PGBIN/pg_ctl" -D "$WORK/cluster" -o "-p $PORT -k $WORK -c listen_addresses=127.0.0.1" -l "$WORK/pg.log" -w start >/dev/null
cleanup() { "${AS_PG[@]}" "$PGBIN/pg_ctl" -D "$WORK/cluster" -m fast -w stop >/dev/null 2>&1 || true; }
trap cleanup EXIT
URL="postgres://$PGUSER@127.0.0.1:$PORT/pencil"
"$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U "$PGUSER" pencil

echo "1. migrate and write a deal"
DEAL_ID=$(cd "$ROOT/packages/db" && DATABASE_URL="$URL" pnpm exec tsx scripts/drill-seed.ts)
echo "   deal $DEAL_ID"

echo "2. back up"
DATABASE_URL="$URL" "$ROOT/scripts/backup.sh" "$WORK/pencil.dump"

echo "3. destroy the database"
"$PGBIN/dropdb" -h 127.0.0.1 -p "$PORT" -U "$PGUSER" pencil
"$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U "$PGUSER" pencil

echo "4. restore"
DATABASE_URL="$URL" "$ROOT/scripts/restore.sh" "$WORK/pencil.dump"

echo "5. verify"
NAME=$("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$PGUSER" -d pencil -tAc "select name from deals where id = '$DEAL_ID'")
INPUTS=$("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$PGUSER" -d pencil -tAc "select count(*) from input_history where deal_id = '$DEAL_ID'")
MIGRATIONS=$("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$PGUSER" -d pencil -tAc "select count(*) from pencil_migrations")
echo "   deal name: '$NAME'; history rows: $INPUTS; migrations recorded: $MIGRATIONS"
if [ "$NAME" = "Restore drill" ] && [ "$INPUTS" -gt 0 ] && [ "$MIGRATIONS" -ge 2 ]; then
  echo "PASS: restore drill succeeded"
else
  echo "FAIL: restored database does not match"
  exit 1
fi
