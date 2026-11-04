#!/usr/bin/env bash
# Daily backup (spec 14.1): pg_dump of DATABASE_URL in custom (compressed) format to the given
# path, uploaded to S3/R2 when S3_BUCKET is set. Run by .github/workflows/backup.yml nightly.
#   DATABASE_URL=postgres://… scripts/backup.sh backups/pencil-2026-11-04.dump
set -euo pipefail
OUT=${1:-pencil-$(date -u +%Y%m%dT%H%M%SZ).dump}
: "${DATABASE_URL:?DATABASE_URL is required}"
mkdir -p "$(dirname "$OUT")"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT" "$DATABASE_URL"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
if [ -n "${S3_BUCKET:-}" ]; then
  aws s3 cp "$OUT" "s3://$S3_BUCKET/backups/$(basename "$OUT")" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
  echo "uploaded to s3://$S3_BUCKET/backups/$(basename "$OUT")"
fi
