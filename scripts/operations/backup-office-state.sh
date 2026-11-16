#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.runtime/office-test.env"
BACKUP_ROOT="${SITEMAPPER_BACKUP_ROOT:-$HOME/site-mapper-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_ROOT/site-mapper-office-$STAMP"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing OFFICE runtime env: $ENV_FILE" >&2
  exit 1
fi

DB_NAME="$(grep '^MONGODB_DB_NAME=' "$ENV_FILE" | cut -d= -f2-)"
DB_NAME="${DB_NAME:-seed-01}"

umask 077
mkdir -p "$OUT/runtime" "$OUT/config"
chmod 700 "$OUT" "$OUT/runtime" "$OUT/config"

cd "$ROOT_DIR"
set -- docker compose --env-file "$ENV_FILE" -f docker-compose.telemetry.yml -f docker-compose.office-test.yml

echo "Creating MongoDB backup..."
"$@" exec -T mongodb mongodump --quiet --db "$DB_NAME" --archive --gzip > "$OUT/mongodb.archive.gz"

echo "Creating TimescaleDB backup..."
"$@" exec -T timescaledb pg_dump -U site_mapper -d site_mapper_telemetry -Fc > "$OUT/timescale.dump"

test -s "$OUT/mongodb.archive.gz"
test -s "$OUT/timescale.dump"

cp "$ENV_FILE" "$OUT/runtime/office-test.env"
chmod 600 "$OUT/runtime/office-test.env"

for file in   docker-compose.telemetry.yml   docker-compose.office-test.yml   infra/field/mosquitto.conf   infra/field/office-test.env.example   infra/field/office-up.sh; do
  cp "$file" "$OUT/config/$(basename "$file")"
done

"$@" ps --format json > "$OUT/compose-ps.json" 2>/dev/null || "$@" ps > "$OUT/compose-ps.txt"

GIT_SHA="UNKNOWN"
if command -v git >/dev/null 2>&1 && git rev-parse HEAD >/dev/null 2>&1; then
  GIT_SHA="$(git rev-parse HEAD)"
fi

cat > "$OUT/MANIFEST.txt" <<EOF
createdAt=$STAMP
gitSha=$GIT_SHA
mongoDatabase=$DB_NAME
mongoArchive=mongodb.archive.gz
timescaleDatabase=site_mapper_telemetry
timescaleDump=timescale.dump
runtimeEnv=runtime/office-test.env
profile=OFFICE_FIELD
EOF

(
  cd "$OUT"
  sha256sum mongodb.archive.gz timescale.dump runtime/office-test.env config/* MANIFEST.txt > SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)

echo "OFFICE_BACKUP_OK $OUT"
echo "Run: sh scripts/operations/verify-office-backup-restore.sh '$OUT'"
