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

dc() {
  docker compose -p "$PROJECT" -f "$COMPOSE" "$@"
}

pg_scalar() {
  dc exec -T timescaledb \
    psql -X -Atq -v ON_ERROR_STOP=1 -U site_mapper -d site_mapper_telemetry -c "$1"
}

numeric_scalar() {
  value="$1"
  case "$value" in
    ''|*[!0-9]*)
      echo "S00 local SQL scalar is not numeric: '$value'" >&2
      return 1
      ;;
  esac
  printf '%s' "$value"
}

cleanup() {
  if [ "$KEEP" = "1" ]; then
    echo "S00 local stack kept for inspection: project=$PROJECT"
    return
  fi
  dc down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "=== 1/8 LOCAL CODE VALIDATION ==="
sh scripts/operations/validate-s00-code.sh

echo "=== 2/8 RENDER ISOLATED LOCAL COMPOSE ==="
python3 scripts/operations/render-s00-local-compose.py >/dev/null
test -s "$COMPOSE"

# Destroy only the dedicated Sprint 00 project from an earlier interrupted run.
dc down -v --remove-orphans >/dev/null 2>&1 || true

echo "=== 3/8 START CLEAN LOCAL STACK ==="
dc up -d --build \
  mongodb mongo-init timescaledb telemetry-store mosquitto site-mapper integration-bootstrap \
  mqtt-publisher snmp-agent-qdf2 snmp-agent-qdf4 snmp-agent-qdf5 \
  snmp-collector-qdf2 snmp-collector-qdf4 snmp-collector-qdf5

echo "=== 4/8 WAIT FOR APPLICATION AND TELEMETRY ==="
i=0
until dc exec -T site-mapper \
  node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 120 ] || {
    dc logs --tail 150 site-mapper telemetry-store mongodb timescaledb
    echo "S00 local app did not become healthy" >&2
    exit 10
  }
  sleep 1
done

i=0
while :; do
  ready=1
  MQTT_ROWS=0
  for serial in 26092403950003 26092403950004 26092403950002; do
    count="$(pg_scalar "SELECT count(*) FROM telemetry_samples WHERE source_identity='$serial';")"
    count="$(numeric_scalar "$count")"
    MQTT_ROWS=$((MQTT_ROWS + count))
    if [ "$count" -le 0 ]; then
      ready=0
    fi
  done

  SNMP_ROWS=0
  for source in INT-SNMP-QDF-2 INT-SNMP-QDF-4 INT-SNMP-QDF-5; do
    count="$(pg_scalar "SELECT count(*) FROM telemetry_entity_samples WHERE source_identity='$source';")"
    count="$(numeric_scalar "$count")"
    SNMP_ROWS=$((SNMP_ROWS + count))
    if [ "$count" -le 0 ]; then
      ready=0
    fi
  done

  if [ "$ready" -eq 1 ]; then
    break
  fi

  i=$((i + 1))
  [ "$i" -lt 90 ] || {
    dc logs --tail 150 mqtt-publisher snmp-collector-qdf2 snmp-collector-qdf4 snmp-collector-qdf5 site-mapper
    echo "S00 local telemetry did not converge for all 3 MQTT + 3 SNMP sources" >&2
    exit 11
  }
  sleep 1
done

echo "=== 5/8 INVENTORY / BINDING AUDIT ==="
dc exec -T mongodb mongosh --quiet seed-01 < scripts/operations/audit-s00-local.mongosh.js

echo "=== 6/8 HISTORY AUDIT ==="
for serial in 26092403950003 26092403950004 26092403950002; do
  case "$serial" in
    26092403950003|26092403950004|26092403950002) ;;
    *) echo "Unexpected MQTT serial in S00 gate: $serial" >&2; exit 12 ;;
  esac
  count="$(pg_scalar "SELECT count(*) FROM telemetry_samples WHERE source_identity='$serial';")"
  count="$(numeric_scalar "$count")"
  [ "$count" -gt 0 ] || { echo "No MQTT history for $serial" >&2; exit 12; }
  echo "$serial mqttHistory=$count"
done

for source in INT-SNMP-QDF-2 INT-SNMP-QDF-4 INT-SNMP-QDF-5; do
  case "$source" in
    INT-SNMP-QDF-2|INT-SNMP-QDF-4|INT-SNMP-QDF-5) ;;
    *) echo "Unexpected SNMP source in S00 gate: $source" >&2; exit 13 ;;
  esac
  count="$(pg_scalar "SELECT count(*) FROM telemetry_entity_samples WHERE source_identity='$source';")"
  count="$(numeric_scalar "$count")"
  [ "$count" -gt 0 ] || { echo "No SNMP history for $source" >&2; exit 13; }
  echo "$source snmpHistory=$count"
done

echo "=== 7/8 LOCAL BACKUP / ISOLATED RESTORE ==="
BACKUP="$RUNTIME/backup"
rm -rf "$BACKUP"
mkdir -p "$BACKUP"
dc exec -T mongodb \
  mongodump --quiet --db seed-01 --archive --gzip > "$BACKUP/mongodb.archive.gz"
dc exec -T timescaledb \
  pg_dump -U site_mapper -d site_mapper_telemetry -Fc > "$BACKUP/timescale.dump"
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
sh scripts/operations/verify-isolated-backup-restore.sh "$BACKUP"

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
