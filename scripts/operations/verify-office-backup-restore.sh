#!/bin/sh
set -eu

BACKUP_DIR="${1:-}"
if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
  echo "Usage: $0 BACKUP_DIRECTORY" >&2
  exit 64
fi
BACKUP_DIR="$(CDPATH= cd -- "$BACKUP_DIR" && pwd)"

for file in mongodb.archive.gz timescale.dump MANIFEST.txt SHA256SUMS; do
  test -s "$BACKUP_DIR/$file" || {
    echo "Missing backup artifact: $file" >&2
    exit 1
  }
done

(
  cd "$BACKUP_DIR"
  sha256sum -c SHA256SUMS
)

SUFFIX="$$"
MONGO="sitemapper-s00-restore-mongo-$SUFFIX"
PG="sitemapper-s00-restore-timescale-$SUFFIX"

cleanup() {
  docker rm -f "$MONGO" "$PG" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run -d --rm --name "$MONGO" mongo:7.0 mongod --bind_ip_all >/dev/null
i=0
until docker exec "$MONGO" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1; do
  i=$((i + 1))
  [ "$i" -lt 60 ] || { echo "Temporary MongoDB did not become ready" >&2; exit 2; }
  sleep 1
done

docker exec -i "$MONGO" mongorestore --quiet --archive --gzip < "$BACKUP_DIR/mongodb.archive.gz"
MONGO_DB="$(sed -n 's/^mongoDatabase=//p' "$BACKUP_DIR/MANIFEST.txt" 2>/dev/null || true)"
MONGO_DB="${MONGO_DB:-seed-01}"
TOPOLOGY_COUNT="$(docker exec "$MONGO" mongosh --quiet "$MONGO_DB" --eval 'db.topology_nodes.countDocuments({})')"
SEED_COUNT="$(docker exec "$MONGO" mongosh --quiet "$MONGO_DB" --eval 'db.runtime_seed_state.countDocuments({_id:"seed-01"})')"
[ "$TOPOLOGY_COUNT" -gt 0 ] || { echo "Restored Mongo topology is empty" >&2; exit 3; }
[ "$SEED_COUNT" -eq 1 ] || { echo "Restored seed state missing/ambiguous" >&2; exit 3; }

docker run -d --rm --name "$PG"   -e POSTGRES_USER=site_mapper   -e POSTGRES_PASSWORD=s00-restore-only   -e POSTGRES_DB=site_mapper_telemetry   timescale/timescaledb:latest-pg16 >/dev/null

i=0
until docker exec "$PG" pg_isready -U site_mapper -d site_mapper_telemetry >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 90 ] || { echo "Temporary TimescaleDB did not become ready" >&2; exit 4; }
  sleep 1
done

docker exec "$PG" psql -X -q -U site_mapper -d site_mapper_telemetry   -c 'CREATE EXTENSION IF NOT EXISTS timescaledb;' >/dev/null
# Timescale recommends restore mode around logical restore operations.
docker exec "$PG" psql -X -q -U site_mapper -d site_mapper_telemetry   -c 'SELECT timescaledb_pre_restore();' >/dev/null || true

docker exec -i "$PG" pg_restore   -U site_mapper -d site_mapper_telemetry   --no-owner --no-privileges --clean --if-exists < "$BACKUP_DIR/timescale.dump"

docker exec "$PG" psql -X -q -U site_mapper -d site_mapper_telemetry   -c 'SELECT timescaledb_post_restore();' >/dev/null || true

TABLE_COUNT="$(docker exec "$PG" psql -X -At -U site_mapper -d site_mapper_telemetry   -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('telemetry_samples','telemetry_entity_samples');")"
[ "$TABLE_COUNT" -ge 1 ] || { echo "Timescale telemetry schema was not restored" >&2; exit 5; }

SAMPLE_COUNT="$(docker exec "$PG" psql -X -At -U site_mapper -d site_mapper_telemetry   -c "SELECT CASE WHEN to_regclass('public.telemetry_samples') IS NULL THEN -1 ELSE (SELECT count(*) FROM telemetry_samples) END;")"

echo "OFFICE_RESTORE_VERIFY_OK"
echo "mongoTopologyNodes=$TOPOLOGY_COUNT"
echo "mongoSeedState=$SEED_COUNT"
echo "timescaleTelemetryTables=$TABLE_COUNT"
echo "timescaleTelemetrySamples=$SAMPLE_COUNT"
echo "No active Site Mapper volume was modified."
