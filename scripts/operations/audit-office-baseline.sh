#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.runtime/office-test.env"
MONGO_AUDIT="$ROOT_DIR/scripts/operations/audit-office-baseline.mongosh.js"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing OFFICE runtime env: $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"
set -- docker compose --env-file "$ENV_FILE" -f docker-compose.telemetry.yml -f docker-compose.office-test.yml

echo "=== SERVICES ==="
"$@" ps

echo "=== MONGO / INVENTORY / BINDINGS ==="
"$@" exec -T mongodb mongosh --quiet seed-01 < "$MONGO_AUDIT"

echo "=== TIMESCALE HISTORY ==="
MQTT_COUNT="$("$@" exec -T timescaledb psql -X -At -U site_mapper -d site_mapper_telemetry -c 'SELECT count(*) FROM telemetry_samples;' | tr -d '[:space:]')"
ENTITY_COUNT="$("$@" exec -T timescaledb psql -X -At -U site_mapper -d site_mapper_telemetry -c 'SELECT count(*) FROM telemetry_entity_samples;' | tr -d '[:space:]')"
SNMP_BATCHES="$("$@" exec -T timescaledb psql -X -At -U site_mapper -d site_mapper_telemetry -c 'SELECT count(*) FROM snmp_ingest_batches;' | tr -d '[:space:]')"
MQTT_LATEST="$("$@" exec -T timescaledb psql -X -At -U site_mapper -d site_mapper_telemetry -c "SELECT COALESCE(max(observed_at)::text,'NONE') FROM telemetry_samples;")"
SNMP_LATEST="$("$@" exec -T timescaledb psql -X -At -U site_mapper -d site_mapper_telemetry -c "SELECT COALESCE(max(observed_at)::text,'NONE') FROM snmp_ingest_batches;")"

echo "telemetry_samples=$MQTT_COUNT latest=$MQTT_LATEST"
echo "telemetry_entity_samples=$ENTITY_COUNT"
echo "snmp_ingest_batches=$SNMP_BATCHES latest=$SNMP_LATEST"

if [ "${SITEMAPPER_S00_REQUIRE_HISTORY:-1}" = "1" ]; then
  [ "$MQTT_COUNT" -gt 0 ] || { echo "S00 blocked: no MQTT history" >&2; exit 20; }
  [ "$ENTITY_COUNT" -gt 0 ] || { echo "S00 blocked: no entity history" >&2; exit 21; }
  [ "$SNMP_BATCHES" -gt 0 ] || { echo "S00 blocked: no SNMP durable batches" >&2; exit 22; }
fi

echo "=== TELEMETRY STORE ==="
curl -fsS http://127.0.0.1:18081/health
echo

echo "S00_OFFICE_BASELINE_PASS"
