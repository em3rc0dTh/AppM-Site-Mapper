#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
PROJECT="site-mapper-s00-local"
RUNTIME="$ROOT_DIR/.runtime/s00-local"
COMPOSE="$RUNTIME/compose.json"
ENV_FILE="$ROOT_DIR/infra/integration/integration.env"
KEEP="${SITEMAPPER_S00_KEEP_LOCAL:-0}"

if [ "$PROJECT" != "site-mapper-s00-local" ]; then
  echo "Safety guard: unexpected project name" >&2
  exit 90
fi

mkdir -p "$RUNTIME"
cd "$ROOT_DIR"

cleanup() {
  if [ "$KEEP" = "1" ]; then
    echo "S00 local stack kept for inspection: project=$PROJECT"
    return
  fi
  docker compose -p "$PROJECT" -f "$COMPOSE" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "=== 1/8 LOCAL CODE VALIDATION ==="
sh scripts/operations/validate-s00-code.sh

echo "=== 2/8 RENDER ISOLATED LOCAL COMPOSE ==="
python3 scripts/operations/render-s00-local-compose.py >/dev/null
test -s "$COMPOSE"

# Destroy only the dedicated Sprint 00 project from an earlier interrupted run.
docker compose -p "$PROJECT" -f "$COMPOSE" down -v --remove-orphans >/dev/null 2>&1 || true

echo "=== 3/8 START CLEAN LOCAL STACK ==="
docker compose -p "$PROJECT" -f "$COMPOSE" up -d --build   mongodb mongo-init timescaledb telemetry-store mosquitto site-mapper integration-bootstrap   mqtt-publisher snmp-agent-qdf2 snmp-agent-qdf4 snmp-agent-qdf5   snmp-collector-qdf2 snmp-collector-qdf4 snmp-collector-qdf5

echo "=== 4/8 WAIT FOR APPLICATION AND TELEMETRY ==="
i=0
until docker compose -p "$PROJECT" -f "$COMPOSE" exec -T site-mapper   node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 120 ] || {
    docker compose -p "$PROJECT" -f "$COMPOSE" logs --tail 150 site-mapper telemetry-store mongodb timescaledb
    echo "S00 local app did not become healthy" >&2
    exit 10
  }
  sleep 1
done

i=0
while :; do
  MQTT_ROWS="$(docker compose -p "$PROJECT" -f "$COMPOSE" exec -T timescaledb     psql -X -At -U site_mapper -d site_mapper_telemetry     -c "SELECT count(*) FROM telemetry_samples WHERE source_identity IN ('26092403950003','26092403950004','26092403950002');" | tr -d '[:space:]')"
  SNMP_ROWS="$(docker compose -p "$PROJECT" -f "$COMPOSE" exec -T timescaledb     psql -X -At -U site_mapper -d site_mapper_telemetry     -c "SELECT count(*) FROM telemetry_entity_samples WHERE source_identity IN ('INT-SNMP-QDF-2','INT-SNMP-QDF-4','INT-SNMP-QDF-5');" | tr -d '[:space:]')"
  if [ "${MQTT_ROWS:-0}" -gt 0 ] && [ "${SNMP_ROWS:-0}" -gt 0 ]; then
    break
  fi
  i=$((i + 1))
  [ "$i" -lt 90 ] || {
    docker compose -p "$PROJECT" -f "$COMPOSE" logs --tail 150 mqtt-publisher snmp-collector-qdf2 snmp-collector-qdf4 snmp-collector-qdf5 site-mapper
    echo "S00 local telemetry did not converge" >&2
    exit 11
  }
  sleep 1
done

echo "=== 5/8 INVENTORY / BINDING AUDIT ==="
docker compose -p "$PROJECT" -f "$COMPOSE" exec -T mongodb   mongosh --quiet seed-01 < scripts/operations/audit-s00-local.mongosh.js

echo "=== 6/8 HISTORY AUDIT ==="
for serial in 26092403950003 26092403950004 26092403950002; do
  count="$(docker compose -p "$PROJECT" -f "$COMPOSE" exec -T timescaledb     psql -X -At -U site_mapper -d site_mapper_telemetry     -v serial="$serial"     -c "SELECT count(*) FROM telemetry_samples WHERE source_identity=:'serial';" | tr -d '[:space:]')"
  [ "$count" -gt 0 ] || { echo "No MQTT history for $serial" >&2; exit 12; }
  echo "$serial mqttHistory=$count"
done

for source in INT-SNMP-QDF-2 INT-SNMP-QDF-4 INT-SNMP-QDF-5; do
  count="$(docker compose -p "$PROJECT" -f "$COMPOSE" exec -T timescaledb     psql -X -At -U site_mapper -d site_mapper_telemetry     -v source="$source"     -c "SELECT count(*) FROM telemetry_entity_samples WHERE source_identity=:'source';" | tr -d '[:space:]')"
  [ "$count" -gt 0 ] || { echo "No SNMP history for $source" >&2; exit 13; }
  echo "$source snmpHistory=$count"
done

echo "=== 7/8 LOCAL BACKUP / ISOLATED RESTORE ==="
BACKUP="$RUNTIME/backup"
rm -rf "$BACKUP"
mkdir -p "$BACKUP"
docker compose -p "$PROJECT" -f "$COMPOSE" exec -T mongodb   mongodump --quiet --db seed-01 --archive --gzip > "$BACKUP/mongodb.archive.gz"
docker compose -p "$PROJECT" -f "$COMPOSE" exec -T timescaledb   pg_dump -U site_mapper -d site_mapper_telemetry -Fc > "$BACKUP/timescale.dump"
cat > "$BACKUP/MANIFEST.txt" <<EOF
mongoDatabase=seed-01
profile=S00_LOCAL
project=$PROJECT
EOF
(
  cd "$BACKUP"
  sha256sum mongodb.archive.gz timescale.dump MANIFEST.txt > SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)
sh scripts/operations/verify-office-backup-restore.sh "$BACKUP"

echo "=== 8/8 ACCEPTANCE RECEIPT ==="
SHA="$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
cat > "$RUNTIME/SPRINT-00-ACCEPTANCE.txt" <<EOF
status=ACCEPTED_LOCAL
acceptedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$SHA
project=$PROJECT
seedVersion=8
breakers=74
mqttHistory=$MQTT_ROWS
snmpHistory=$SNMP_ROWS
fieldTouched=false
EOF
chmod 600 "$RUNTIME/SPRINT-00-ACCEPTANCE.txt"

echo "SPRINT_00_ACCEPTED_LOCAL"
echo "receipt=$RUNTIME/SPRINT-00-ACCEPTANCE.txt"
echo "TFARM04_TOUCHED=false"
