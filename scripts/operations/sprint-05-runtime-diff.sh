#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
PROJECT="site-mapper-s05-local"
RUNTIME="$ROOT_DIR/.runtime/s05-local"
COMPOSE="$RUNTIME/compose.json"
PRIVATE_MANIFEST="$ROOT_DIR/.runtime/s05-commissioning-reference.json"
DIFF="$RUNTIME/runtime-diff.json"
RECEIPT="$RUNTIME/SPRINT-05-RUNTIME-DIFF-ACCEPTANCE.txt"
IMAGE="appm-site-mapper:s05-validation"

cd "$ROOT_DIR"
mkdir -p "$RUNTIME"
rm -f "$DIFF" "$RECEIPT"

[ "$PROJECT" = "site-mapper-s05-local" ] || {
  echo "Safety guard: unexpected S05 project name" >&2
  exit 90
}
[ -s "$PRIVATE_MANIFEST" ] || {
  echo "S05 private manifest missing: $PRIVATE_MANIFEST" >&2
  exit 20
}

dc() {
  docker compose -p "$PROJECT" -f "$COMPOSE" "$@"
}

cleanup() {
  dc down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "Sprint 05-B LOCAL-ONLY. Disposable runtime, read-only diff, APPLY forbidden."

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "=== 1/7 BUILD NODE 22 S05 VALIDATION IMAGE ==="
  docker build --target test -t "$IMAGE" -f infra/site-mapper/Dockerfile .
else
  echo "=== 1/7 REUSE NODE 22 S05 VALIDATION IMAGE ==="
fi

echo "=== 2/7 VALIDATE PRIVATE MANIFEST ==="
docker run --rm --network none   -v "$PRIVATE_MANIFEST:/tmp/s05-reference.json:ro"   "$IMAGE" node scripts/operations/audit-s05-commissioning.mjs   --manifest /tmp/s05-reference.json --manifest-only

echo "=== 3/7 RENDER ISOLATED CANONICAL RUNTIME ==="
python3 scripts/operations/render-s05-local-compose.py >/dev/null
test -s "$COMPOSE"

dc down -v --remove-orphans >/dev/null 2>&1 || true

echo "=== 4/7 START CLEAN SEED V8 MONGO RUNTIME ==="
dc up -d --build mongodb mongo-init timescaledb telemetry-store mosquitto site-mapper

echo "=== 5/7 WAIT FOR SITE MAPPER / SEED COMPLETION ==="
i=0
until dc exec -T site-mapper   node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"   >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 120 ]; then
    dc logs --tail 150 site-mapper mongodb telemetry-store
    echo "S05 isolated app did not become healthy" >&2
    exit 21
  fi
  sleep 1
done

dc exec -T mongodb mongosh --quiet seed-01 --eval '
  const state=db.runtime_seed_state.findOne({_id:"seed-01"});
  if (!state || state.status!=="APPLIED" || state.version!==8) {
    printjson(state); quit(2);
  }
  const breakers=db.topology_nodes.countDocuments({
    kind:"EQUIPMENT",equipmentType:"CIRCUIT_BREAKER",lifecycle:"ACTIVE"
  });
  if (breakers!==74) { print("BREAKERS="+breakers); quit(3); }
  print("S05_SEED_V8_READY breakers="+breakers);
'

echo "=== 6/7 READ-ONLY PRIVATE REFERENCE VS RUNTIME DIFF ==="
NETWORK="site-mapper-s05-local_default"
docker network inspect "$NETWORK" >/dev/null 2>&1 || {
  echo "S05 isolated Docker network missing: $NETWORK" >&2
  exit 22
}

docker run --rm --network "$NETWORK"   -v "$PRIVATE_MANIFEST:/tmp/s05-reference.json:ro"   "$IMAGE" node scripts/operations/audit-s05-commissioning.mjs   --manifest /tmp/s05-reference.json   --database seed-01   --mongo-uri 'mongodb://mongodb:27017/?replicaSet=rs0&directConnection=true'   > "$DIFF"

python3 - "$DIFF" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding="utf8"))
findings = data.get("findings", [])
summary = data.get("manifestSummary", {})

def rows(kind=None, field=None, status=None):
    result = findings
    if kind is not None:
        result = [x for x in result if x.get("kind") == kind]
    if field is not None:
        result = [x for x in result if x.get("field") == field]
    if status is not None:
        result = [x for x in result if x.get("status") == status]
    return result

expected_summary = {"qdfs": 3, "gateways": 3, "meters": 12, "breakers": 74}
if summary != expected_summary:
    raise SystemExit(f"S05 unexpected manifest summary: {summary}")

breaker_rows = rows(kind="BREAKER")
if len(breaker_rows) != 74 or any(x.get("status") != "MATCH" for x in breaker_rows):
    bad = [x for x in breaker_rows if x.get("status") != "MATCH"]
    raise SystemExit(f"S05 breaker reconciliation failed: count={len(breaker_rows)} bad={bad[:5]}")

gateway_serials = rows(kind="GATEWAY", field="serial")
if len(gateway_serials) != 3 or any(x.get("status") != "MATCH" for x in gateway_serials):
    raise SystemExit(f"S05 gateway serial mismatch: {gateway_serials}")

meter_serials = rows(kind="METER", field="serial")
if len(meter_serials) != 12:
    raise SystemExit(f"S05 expected 12 meter serial findings, got {len(meter_serials)}")

conflicts = {
    (x.get("qdf"), x.get("element"), str(x.get("expected")), str(x.get("actual")))
    for x in meter_serials if x.get("status") == "CONFLICT"
}
expected_conflicts = {
    ("QDF-2", "QDF-2_METER-A2", "26042902290008", "26042902290014"),
    ("QDF-2", "QDF-2_METER-B2", "26042902290014", "26042902290012"),
    ("QDF-5", "QDF-5_METER-A2", "26042902290012", "26042902290008"),
}
if conflicts != expected_conflicts:
    raise SystemExit(f"S05 meter serial conflict set changed: {sorted(conflicts)}")
if sum(1 for x in meter_serials if x.get("status") == "MATCH") != 9:
    raise SystemExit("S05 expected exactly 9 matching meter serials")

slave_inventory = rows(kind="METER", field="inventorySlaveId")
slave_profiles = rows(kind="METER_PROFILE", field="rs485.slaveId")
if len(slave_inventory) != 12 or any(x.get("status") != "MATCH" for x in slave_inventory):
    raise SystemExit(f"S05 inventory Slave ID mismatch: {slave_inventory}")
if len(slave_profiles) != 12 or any(x.get("status") != "MATCH" for x in slave_profiles):
    raise SystemExit(f"S05 profile Slave ID mismatch: {slave_profiles}")

network_pending = [
    x for x in rows(kind="GATEWAY_PROFILE", status="MISSING_IN_RUNTIME")
    if str(x.get("field", "")).startswith("network.")
]
if len(network_pending) != 9:
    raise SystemExit(f"S05 expected 9 FIELD network attributes pending local APPLY, got {len(network_pending)}")

duplicates = rows(kind="BINDINGS", field="duplicateSourcePoints")
if len(duplicates) != 1 or duplicates[0].get("status") != "MATCH" or duplicates[0].get("actual") != 0:
    raise SystemExit(f"S05 duplicate binding invariant failed: {duplicates}")

source_bindings = rows(kind="MQTT", field="sourceBindings")
metric_bindings = rows(kind="MQTT", field="metricBindings")
if len(source_bindings) != 3 or any(x.get("status") != "MATCH" for x in source_bindings):
    raise SystemExit(f"S05 MQTT source binding invariant failed: {source_bindings}")
metric_total = sum(int(x.get("actual") or 0) for x in metric_bindings)
if metric_total != 296:
    raise SystemExit(f"S05 expected 296 MQTT metric bindings, got {metric_total}")

snmp = data.get("snmpObserved", [])
snmp_total = sum(int(x.get("count") or 0) for x in snmp)
if len(snmp) != 3 or snmp_total != 24:
    raise SystemExit(f"S05 expected 3 SNMP sources / 24 bindings, got sources={len(snmp)} bindings={snmp_total}")

if data.get("status") != "S05_DIFF_REQUIRES_REVIEW":
    raise SystemExit(f"S05 expected review state while FIELD conflicts remain, got {data.get('status')}")

print("S05_RUNTIME_DIFF_CONTRACT_PASS")
print("breakersMatched=74")
print("meterSerialMatches=9")
print("meterSerialConflicts=3")
print("gatewayNetworkPending=9")
print("mqttMetricBindings=296")
print("snmpBindings=24")
PY

echo "=== 7/7 ISSUE S05 LOCAL ACCEPTANCE RECEIPT ==="
SHA="$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
cat > "$RECEIPT" <<EOF
status=S05_LOCAL_ACCEPTED_WITH_KNOWN_FIELD_CONFLICTS
acceptedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$SHA
project=$PROJECT
seedVersion=8
breakersMatched=74
meterSerialMatches=9
meterSerialConflicts=3
gatewayNetworkPending=9
mqttMetricBindings=296
snmpBindings=24
runtimeDiff=$DIFF
applyAllowed=false
fieldTouched=false
EOF
chmod 600 "$RECEIPT"

echo "S05_LOCAL_ACCEPTED_WITH_KNOWN_FIELD_CONFLICTS"
echo "receipt=$RECEIPT"
echo "runtimeDiff=$DIFF"
echo "APPLY_ALLOWED=false"
echo "TFARM04_TOUCHED=false"
