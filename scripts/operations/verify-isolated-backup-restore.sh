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

pg_scalar_retry() {
  db="$1"
  sql="$2"
  label="$3"
  i=0
  while :; do
    if value="$(docker exec "$PG" psql -X -Atq -v ON_ERROR_STOP=1       -U site_mapper -d "$db" -c "$sql" 2>/dev/null)"; then
      printf '%s' "$value"
      return 0
    fi
    i=$((i + 1))
    [ "$i" -lt 60 ] || {
      echo "TimescaleDB SQL did not stabilize for $label after 60 attempts" >&2
      docker exec "$PG" psql -X -Atq -v ON_ERROR_STOP=1         -U site_mapper -d "$db" -c "$sql" >&2 || true
      return 1
    }
    sleep 1
  done
}

pg_exec_retry() {
  db="$1"
  sql="$2"
  label="$3"
  i=0
  while :; do
    if docker exec "$PG" psql -X -q -v ON_ERROR_STOP=1       -U site_mapper -d "$db" -c "$sql" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    [ "$i" -lt 60 ] || {
      echo "TimescaleDB SQL command did not stabilize for $label after 60 attempts" >&2
      docker exec "$PG" psql -X -q -v ON_ERROR_STOP=1         -U site_mapper -d "$db" -c "$sql" >&2 || true
      return 1
    }
    sleep 1
  done
}

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

TIMESCALE_IMAGE="$(sed -n 's/^timescaleImage=//p' "$BACKUP_DIR/MANIFEST.txt" 2>/dev/null || true)"
TIMESCALE_VERSION_EXPECTED="$(sed -n 's/^timescaleVersion=//p' "$BACKUP_DIR/MANIFEST.txt" 2>/dev/null || true)"
TIMESCALE_IMAGE="${TIMESCALE_IMAGE:-timescale/timescaledb:latest-pg16}"

docker image inspect "$TIMESCALE_IMAGE" >/dev/null 2>&1 || {
  echo "Exact TimescaleDB backup image is unavailable locally: $TIMESCALE_IMAGE" >&2
  exit 4
}

docker run -d --rm --name "$PG" \
  -e POSTGRES_USER=site_mapper \
  -e POSTGRES_PASSWORD=s00-restore-only \
  -e POSTGRES_DB=site_mapper_telemetry \
  "$TIMESCALE_IMAGE" >/dev/null

i=0
until docker exec "$PG" pg_isready -U site_mapper -d site_mapper_telemetry >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 90 ] || { echo "Temporary TimescaleDB did not become ready" >&2; exit 4; }
  sleep 1
done

echo "RESTORE_STAGE=timescale_initial_sql_stability"
pg_exec_retry site_mapper_telemetry \
  'CREATE EXTENSION IF NOT EXISTS timescaledb;' \
  "initial Timescale extension creation"

TIMESCALE_VERSION_ACTUAL="$(pg_scalar_retry site_mapper_telemetry \
  "SELECT extversion FROM pg_extension WHERE extname='timescaledb';" \
  "initial Timescale extension version")"
if [ -n "$TIMESCALE_VERSION_EXPECTED" ] && [ "$TIMESCALE_VERSION_ACTUAL" != "$TIMESCALE_VERSION_EXPECTED" ]; then
  echo "TimescaleDB version mismatch: backup=$TIMESCALE_VERSION_EXPECTED restore=$TIMESCALE_VERSION_ACTUAL" >&2
  exit 4
fi

# TimescaleDB's pre-restore hook stops background workers. Some container/image
# combinations terminate the invoking psql connection while doing so. Treat that
# disconnect as acceptable only if PostgreSQL becomes ready again immediately;
# any persistent outage still fails closed.
echo "RESTORE_STAGE=timescale_pre_restore"
set +e
docker exec "$PG" psql -X -q -v ON_ERROR_STOP=1 -U site_mapper -d site_mapper_telemetry \
  -c 'SELECT timescaledb_pre_restore();' >/dev/null 2>&1
PRE_RESTORE_RC=$?
set -e

i=0
until docker exec "$PG" pg_isready -U site_mapper -d site_mapper_telemetry >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 60 ] || {
    echo "TimescaleDB did not recover readiness after pre_restore (rc=$PRE_RESTORE_RC)" >&2
    exit 4
  }
  sleep 1
done

# Verify restore mode from a fresh connection. If pre_restore disconnected before
# persisting the database-level GUC, set it explicitly and invoke pre_restore
# once more so background workers are stopped before pg_restore.
RESTORING="$(pg_scalar_retry site_mapper_telemetry \
  "SELECT current_setting('timescaledb.restoring', true);" \
  "restore-mode verification after pre_restore")"
case "$RESTORING" in
  on|true|1) ;;
  *)
    echo "timescaledb_pre_restore did not persist restore mode (rc=$PRE_RESTORE_RC, restoring=$RESTORING); applying guarded recovery" >&2
    pg_exec_retry postgres \
      "ALTER DATABASE site_mapper_telemetry SET timescaledb.restoring='on';" \
      "guarded restore-mode ALTER DATABASE"

    set +e
    docker exec "$PG" psql -X -q -v ON_ERROR_STOP=1 -U site_mapper -d site_mapper_telemetry \
      -c 'SELECT timescaledb_pre_restore();' >/dev/null 2>&1
    PRE_RESTORE_RETRY_RC=$?
    set -e

    i=0
    until docker exec "$PG" pg_isready -U site_mapper -d site_mapper_telemetry >/dev/null 2>&1; do
      i=$((i + 1))
      [ "$i" -lt 60 ] || {
        echo "TimescaleDB did not recover after guarded pre_restore retry (rc=$PRE_RESTORE_RETRY_RC)" >&2
        exit 4
      }
      sleep 1
    done

    RESTORING="$(pg_scalar_retry site_mapper_telemetry \
      "SELECT current_setting('timescaledb.restoring', true);" \
      "restore-mode verification after guarded retry")"
    case "$RESTORING" in
      on|true|1) ;;
      *)
        echo "TimescaleDB restore mode is still disabled after guarded recovery (rc=$PRE_RESTORE_RETRY_RC, restoring=$RESTORING)" >&2
        exit 4
        ;;
    esac
    ;;
esac

echo "RESTORE_STAGE=timescale_pg_restore"
docker exec -i "$PG" pg_restore \
  -U site_mapper -d site_mapper_telemetry \
  --no-owner --no-privileges --exit-on-error \
  < "$BACKUP_DIR/timescale.dump"

echo "RESTORE_STAGE=timescale_post_restore"
pg_exec_retry site_mapper_telemetry \
  'SELECT timescaledb_post_restore();' \
  "timescaledb_post_restore"

POST_RESTORING="$(pg_scalar_retry site_mapper_telemetry \
  "SELECT current_setting('timescaledb.restoring', true);" \
  "post-restore mode verification")"
case "$POST_RESTORING" in
  off|false|0|'') ;;
  *)
    echo "TimescaleDB remained in restore mode after post_restore: $POST_RESTORING" >&2
    exit 5
    ;;
esac

TABLE_COUNT="$(pg_scalar_retry site_mapper_telemetry \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('telemetry_samples','telemetry_entity_samples');" \
  "restored telemetry table count")"
[ "$TABLE_COUNT" -ge 1 ] || { echo "Timescale telemetry schema was not restored" >&2; exit 5; }

SAMPLE_COUNT="$(pg_scalar_retry site_mapper_telemetry \
  "SELECT CASE WHEN to_regclass('public.telemetry_samples') IS NULL THEN -1 ELSE (SELECT count(*) FROM telemetry_samples) END;" \
  "restored telemetry sample count")"

echo "ISOLATED_RESTORE_VERIFY_OK"
echo "mongoTopologyNodes=$TOPOLOGY_COUNT"
echo "mongoSeedState=$SEED_COUNT"
echo "timescaleTelemetryTables=$TABLE_COUNT"
echo "timescaleTelemetrySamples=$SAMPLE_COUNT"
echo "No active Site Mapper volume was modified."
