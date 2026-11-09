#!/usr/bin/env bash
set -u

# Site Mapper FIELD read-only gate.
# Safety contract: no install/delete/restart/migration/volume/network mutation and no SNMP SET.
# Optional --receipt writes only a sanitized local evidence file.

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
ENV_FILE="${SITE_MAPPER_FIELD_ENV_FILE:-$ROOT_DIR/.env}"
MODE="all"
WRITE_RECEIPT=0
RECEIPT_DIR="${SITE_MAPPER_FIELD_RECEIPT_DIR:-/var/lib/site-mapper/receipts}"

failures=0
warnings=0
checks=0
receipt_lines=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/release/field-check.sh [all|vm|config|services|mqtt|snmp|data|modbus] [options]

Options:
  --env-file PATH   Read FIELD values from PATH (default: .env)
  --receipt         Write a sanitized local receipt. This is the only intentional write.
  --receipt-dir DIR Override receipt directory.
  --no-receipt      Explicitly disable receipt writing.
  -h, --help        Show help.

The gate is read-only against Site Mapper data, Docker services, network and FIELD equipment.
It never executes docker compose up/down/restart, migrations, cleanup, SNMP SET or firewall changes.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    all|vm|config|services|mqtt|snmp|data|modbus)
      MODE="$1"; shift ;;
    --env-file)
      [ "$#" -ge 2 ] || { echo "Missing value for --env-file" >&2; exit 64; }
      ENV_FILE="$2"; shift 2 ;;
    --receipt)
      WRITE_RECEIPT=1; shift ;;
    --no-receipt)
      WRITE_RECEIPT=0; shift ;;
    --receipt-dir)
      [ "$#" -ge 2 ] || { echo "Missing value for --receipt-dir" >&2; exit 64; }
      RECEIPT_DIR="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 64 ;;
  esac
done

record() {
  status="$1"; shift
  message="$*"
  printf '%-5s %s\n' "$status" "$message"
  checks=$((checks + 1))
  receipt_lines="$receipt_lines$status|$message
"
}
pass() { record PASS "$@"; }
info() { record INFO "$@"; }
warn() { warnings=$((warnings + 1)); record WARN "$@"; }
fail() { failures=$((failures + 1)); record FAIL "$@"; }

env_value() {
  key="$1"
  current="${!key-}"
  if [ -n "$current" ]; then
    printf '%s' "$current"
    return 0
  fi
  [ -r "$ENV_FILE" ] || return 1
  line="$(grep -E "^[[:space:]]*$key=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
  [ -n "$line" ] || return 1
  value="${line#*=}"
  value="${value%$'\r'}"
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  printf '%s' "$value"
}

is_secret_present() {
  value="$(env_value "$1" 2>/dev/null || true)"
  [ -n "$value" ]
}

container_id_for_service() {
  service="$1"
  docker ps --filter "label=com.docker.compose.service=$service" --format '{{.ID}}' 2>/dev/null | head -n 1
}

container_state_for_service() {
  service="$1"
  cid="$(container_id_for_service "$service")"
  [ -n "$cid" ] || return 1
  docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null
}

check_vm() {
  echo
  echo "=== VM / HOST ==="
  if [ -r "$ROOT_DIR/scripts/release/client-vm-preflight.sh" ]; then
    if bash "$ROOT_DIR/scripts/release/client-vm-preflight.sh"; then
      pass "client VM preflight completed without failures"
    else
      fail "client VM preflight reported one or more failures"
    fi
  else
    fail "client-vm-preflight.sh not found"
  fi
}

check_config() {
  echo
  echo "=== FIELD CONFIGURATION ==="

  [ -r "$ENV_FILE" ] && pass "FIELD env readable: $ENV_FILE" || warn "FIELD env not readable: $ENV_FILE; process environment only"

  app_env="$(env_value APP_ENV 2>/dev/null || true)"
  persistence="$(env_value APP_PERSISTENCE 2>/dev/null || true)"
  telemetry="$(env_value TELEMETRY_ENABLED 2>/dev/null || true)"
  broker="$(env_value MQTT_BROKER_URL 2>/dev/null || true)"
  topic_prefix="$(env_value MQTT_TOPIC_PREFIX 2>/dev/null || true)"
  topic_filter="$(env_value MQTT_TOPIC_FILTER 2>/dev/null || true)"
  snmp_version="$(env_value SNMP_VERSION 2>/dev/null || true)"
  snmp_host="$(env_value SNMP_CONTROLLER_HOST 2>/dev/null || true)"
  snmp_port="$(env_value SNMP_CONTROLLER_PORT 2>/dev/null || true)"
  units="$(env_value MODBUS_SOURCE_UNITS_JSON 2>/dev/null || true)"
  missing_policy="$(env_value MODBUS_MISSING_POLICY 2>/dev/null || true)"

  [ "$app_env" = "production" ] && pass "APP_ENV=production" || fail "APP_ENV must be production for FIELD"
  [ "$persistence" = "mongodb" ] && pass "APP_PERSISTENCE=mongodb" || fail "APP_PERSISTENCE must be mongodb for FIELD"
  [ "$telemetry" = "true" ] && pass "telemetry enabled" || warn "TELEMETRY_ENABLED is not true"

  [ -n "$broker" ] && pass "MQTT broker configured" || fail "MQTT_BROKER_URL missing"
  [ "$topic_prefix" = "data/dev/" ] && pass "MQTT topic prefix=data/dev/" || warn "MQTT_TOPIC_PREFIX differs from data/dev/"
  [ "$topic_filter" = "data/dev/#" ] && pass "MQTT topic filter=data/dev/#" || warn "MQTT_TOPIC_FILTER differs from data/dev/#"

  case "$snmp_version" in
    2c)
      pass "SNMP version=2c"
      [ -n "$snmp_host" ] && pass "SNMP controller host configured" || warn "SNMP_CONTROLLER_HOST missing in base env; per-controller deployment may provide it per service"
      [ "${snmp_port:-161}" = "161" ] && pass "SNMP port=161" || info "SNMP port=$snmp_port"
      if is_secret_present SNMP_COMMUNITY; then pass "SNMP v2c community present (redacted)"; else fail "SNMP v2c community missing"; fi
      ack="$(env_value SNMP_V2C_ACKNOWLEDGE_PLAINTEXT 2>/dev/null || true)"
      [ "$ack" = "true" ] && pass "SNMP v2c plaintext acknowledgement enabled" || warn "SNMP_V2C_ACKNOWLEDGE_PLAINTEXT is not true"
      ;;
    3)
      pass "SNMP version=3"
      is_secret_present SNMP_V3_USERNAME && pass "SNMPv3 username present (redacted)" || fail "SNMPv3 username missing"
      is_secret_present SNMP_V3_AUTH_KEY && pass "SNMPv3 auth key present (redacted)" || fail "SNMPv3 auth key missing"
      is_secret_present SNMP_V3_PRIV_KEY && pass "SNMPv3 privacy key present (redacted)" || fail "SNMPv3 privacy key missing"
      ;;
    "")
      warn "SNMP_VERSION missing; SNMP may be configured per collector"
      ;;
    *)
      fail "unsupported SNMP_VERSION=$snmp_version"
      ;;
  esac

  [ -n "$units" ] && pass "Modbus source-to-unit map configured" || fail "MODBUS_SOURCE_UNITS_JSON missing"
  case "$missing_policy" in
    zero|exception) pass "Modbus missing policy=$missing_policy" ;;
    "") warn "MODBUS_MISSING_POLICY missing; runtime default may apply" ;;
    *) fail "invalid MODBUS_MISSING_POLICY=$missing_policy" ;;
  esac

  for secret in TIMESCALE_DB_PASSWORD TELEMETRY_STORE_TOKEN MODBUS_BRIDGE_TOKEN SITE_MAPPER_CREDENTIAL_KEY; do
    if is_secret_present "$secret"; then pass "$secret present (redacted)"; else warn "$secret not visible to this check"; fi
  done

  if [ -r "$ENV_FILE" ]; then
    if grep -Eq 'site-mapper-integration|seed01-integration|INT-SNMP-QDF|SYNTHETIC_LAB_ONLY' "$ENV_FILE"; then
      fail "LAB/integration marker detected in FIELD env"
    else
      pass "no known LAB/integration markers detected in FIELD env"
    fi
  fi
}

check_services() {
  echo
  echo "=== SERVICES ==="
  if ! command -v docker >/dev/null 2>&1 || ! docker version >/dev/null 2>&1; then
    fail "Docker daemon unavailable; cannot inspect services"
    return
  fi

  for service in mongodb timescaledb telemetry-store site-mapper modbus-tcp; do
    state="$(container_state_for_service "$service" 2>/dev/null || true)"
    if [ "$state" = "running" ]; then
      pass "$service container running"
    elif [ -n "$state" ]; then
      fail "$service container state=$state"
    else
      warn "$service container not found by Compose service label"
    fi
  done

  mosq_state="$(container_state_for_service mosquitto 2>/dev/null || true)"
  if [ "$mosq_state" = "running" ]; then
    pass "mosquitto container running"
  elif command -v ss >/dev/null 2>&1 && ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)1883

check_mqtt() {
  echo
  echo "=== MQTT ==="

  if command -v ss >/dev/null 2>&1 && ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)1883$'; then
    pass "TCP/1883 listener active"
  else
    warn "TCP/1883 listener not detected on host"
  fi

  expected="$(env_value MQTT_EXPECTED_SOURCES 2>/dev/null || true)"
  if [ -z "$expected" ]; then
    expected="26092403950003,26092403950004,26092403950002"
    info "MQTT_EXPECTED_SOURCES not set; checking current known QDF serial baseline"
  fi

  ts="$(container_id_for_service timescaledb)"
  if [ -z "$ts" ]; then
    warn "TimescaleDB container unavailable; cannot confirm MQTT source history"
    return
  fi

  old_ifs="$IFS"
  IFS=', '
  for serial in $expected; do
    [ -n "$serial" ] || continue
    case "$serial" in
      *[!A-Za-z0-9_.:-]*) warn "skipping unsafe expected source identity"; continue ;;
    esac
    count="$(docker exec "$ts" psql -X -Atq -U site_mapper -d site_mapper_telemetry -c "SELECT count(*) FROM telemetry_samples WHERE source_identity='$serial';" 2>/dev/null || true)"
    case "$count" in
      ''|*[!0-9]*) warn "cannot query MQTT history for $serial" ;;
      0) warn "QDF source $serial not yet observed in TimescaleDB" ;;
      *) pass "QDF source $serial observed in TimescaleDB (rows=$count)" ;;
    esac
  done
  IFS="$old_ifs"
}

check_snmp() {
  echo
  echo "=== SNMP ==="

  version="$(env_value SNMP_VERSION 2>/dev/null || true)"
  host="$(env_value SNMP_CONTROLLER_HOST 2>/dev/null || true)"
  port="$(env_value SNMP_CONTROLLER_PORT 2>/dev/null || true)"
  points="$(env_value SNMP_FEED_POINTS_JSON 2>/dev/null || true)"
  port="${port:-161}"

  if [ -z "$host" ]; then
    if command -v docker >/dev/null 2>&1 && docker version >/dev/null 2>&1; then
      collector_ids="$(docker ps --format '{{.ID}} {{.Label "com.docker.compose.service"}}' 2>/dev/null | awk '$2 ~ /^snmp-collector/ {print $1}')"
      if [ -n "$collector_ids" ]; then
        found=0
        for cid in $collector_ids; do
          service="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$cid" 2>/dev/null || true)"
          target="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$cid" 2>/dev/null | sed -n 's/^SNMP_CONTROLLER_HOST=//p' | head -n 1)"
          cversion="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$cid" 2>/dev/null | sed -n 's/^SNMP_VERSION=//p' | head -n 1)"
          if [ -n "$target" ]; then
            pass "$service target configured: $target (version=${cversion:-unknown})"
            found=$((found + 1))
          else
            warn "$service is running but SNMP_CONTROLLER_HOST is empty"
          fi
        done
        [ "$found" -gt 0 ] && return
      fi
    fi
    warn "SNMP_CONTROLLER_HOST not present and no configured snmp-collector* service was detected"
    return
  fi

  pass "SNMP target configured: $host:$port"

  if [ "$version" = "2c" ] && command -v snmpget >/dev/null 2>&1; then
    community="$(env_value SNMP_COMMUNITY 2>/dev/null || true)"
    oid="$(printf '%s' "$points" | sed -n 's/.*"oid"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
    if [ -n "$community" ] && [ -n "$oid" ]; then
      if timeout 5 snmpget -v2c -c "$community" -t 2 -r 0 "$host:$port" "$oid" >/dev/null 2>&1; then
        pass "SNMP v2c read-only GET succeeded for approved profile OID"
      else
        warn "SNMP v2c GET did not return; check routing/firewall/community/OID"
      fi
    else
      warn "SNMP GET skipped: community or approved OID unavailable"
    fi
  elif [ "$version" = "2c" ]; then
    warn "snmpget tool unavailable; no active SNMP GET performed"
  else
    info "active SNMP probe skipped for version=$version"
  fi
}

check_data() {
  echo
  echo "=== DATA STORES / HISTORY ==="

  mongo="$(container_id_for_service mongodb)"
  if [ -n "$mongo" ]; then
    if docker exec "$mongo" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok===1?0:1)' >/dev/null 2>&1; then
      pass "MongoDB ping"
    else
      fail "MongoDB ping failed"
    fi
  else
    warn "MongoDB container unavailable"
  fi

  ts="$(container_id_for_service timescaledb)"
  if [ -n "$ts" ]; then
    if docker exec "$ts" psql -X -Atq -U site_mapper -d site_mapper_telemetry -c 'SELECT 1;' 2>/dev/null | grep -qx '1'; then
      pass "TimescaleDB read query"
    else
      fail "TimescaleDB read query failed"
    fi
  else
    warn "TimescaleDB container unavailable"
  fi
}

check_modbus() {
  echo
  echo "=== MODBUS ==="

  units="$(env_value MODBUS_SOURCE_UNITS_JSON 2>/dev/null || true)"
  if [ -z "$units" ]; then
    fail "MODBUS_SOURCE_UNITS_JSON missing"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    result="$(FIELD_UNITS="$units" python3 - <<'PY'
import json, os, sys
try:
    data = json.loads(os.environ["FIELD_UNITS"])
    if not isinstance(data, dict) or not data:
        raise ValueError("map must be a non-empty object")
    vals = list(data.values())
    if any(not isinstance(v, int) or v < 1 or v > 247 for v in vals):
        raise ValueError("Unit IDs must be integers 1..247")
    if len(vals) != len(set(vals)):
        raise ValueError("duplicate Unit IDs")
    print("OK")
except Exception as exc:
    print(str(exc))
    sys.exit(1)
PY
)" && pass "Modbus source-to-unit map valid and Unit IDs unique" || fail "invalid Modbus source-to-unit map: $result"
  else
    warn "python3 unavailable; JSON/Unit ID uniqueness not validated"
  fi

  modbus_state="$(container_state_for_service modbus-tcp 2>/dev/null || true)"
  [ "$modbus_state" = "running" ] && pass "modbus-tcp container running" || warn "modbus-tcp container not running/found"

  modbus_port="$(env_value MODBUS_CLIENT_PORT 2>/dev/null || true)"
  modbus_port="${modbus_port:-1503}"
  if command -v ss >/dev/null 2>&1 && ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$modbus_port$"; then
    pass "Modbus TCP listener detected on port $modbus_port"
  else
    warn "Modbus TCP listener not detected on host port $modbus_port"
  fi
}

write_receipt() {
  [ "$WRITE_RECEIPT" -eq 1 ] || return 0

  umask 077
  if ! mkdir -p "$RECEIPT_DIR" 2>/dev/null; then
    warn "cannot create receipt directory: $RECEIPT_DIR"
    return 0
  fi

  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  file="$RECEIPT_DIR/$timestamp-field-check.txt"
  result="PASS"
  [ "$failures" -gt 0 ] && result="FAIL"
  [ "$failures" -eq 0 ] && [ "$warnings" -gt 0 ] && result="PASS_WITH_WARNINGS"

  {
    echo "SITE_MAPPER_FIELD_CHECK"
    echo "timestamp=$timestamp"
    echo "mode=$MODE"
    echo "result=$result"
    echo "checks=$checks"
    echo "failures=$failures"
    echo "warnings=$warnings"
    echo "secretsIncluded=false"
    echo
    printf '%s' "$receipt_lines"
  } > "$file"

  chmod 600 "$file" 2>/dev/null || true
  info "sanitized receipt written: $file"
}

case "$MODE" in
  vm) check_vm ;;
  config) check_config ;;
  services) check_services ;;
  mqtt) check_mqtt ;;
  snmp) check_snmp ;;
  data) check_data ;;
  modbus) check_modbus ;;
  all)
    check_vm
    check_config
    check_services
    check_mqtt
    check_snmp
    check_data
    check_modbus
    ;;
esac

write_receipt

echo
echo "================================================"
if [ "$failures" -gt 0 ]; then
  echo "RESULT: NOT_READY ($failures failure(s), $warnings warning(s))"
  exit 1
fi
if [ "$warnings" -gt 0 ]; then
  echo "RESULT: READY_WITH_WARNINGS ($warnings warning(s))"
  echo "FIELD/SAT acceptance still requires commissioning evidence."
  exit 0
fi
echo "RESULT: READY_FOR_COMMISSIONING"
echo "FIELD/SAT acceptance still requires commissioning evidence."
; then
    pass "MQTT listener detected on TCP/1883"
  else
    warn "Mosquitto service not found and TCP/1883 not detected"
  fi

  collector_services="$(docker ps --format '{{.Label "com.docker.compose.service"}}' 2>/dev/null | grep '^snmp-collector' | sort -u || true)"
  if [ -n "$collector_services" ]; then
    count="$(printf '%s\n' "$collector_services" | grep -c . || true)"
    pass "SNMP collector services running: $count"
  else
    warn "no running snmp-collector* service detected"
  fi
}

check_mqtt() {
  echo
  echo "=== MQTT ==="

  if command -v ss >/dev/null 2>&1 && ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)1883$'; then
    pass "TCP/1883 listener active"
  else
    warn "TCP/1883 listener not detected on host"
  fi

  expected="$(env_value MQTT_EXPECTED_SOURCES 2>/dev/null || true)"
  if [ -z "$expected" ]; then
    expected="26092403950003,26092403950004,26092403950002"
    info "MQTT_EXPECTED_SOURCES not set; checking current known QDF serial baseline"
  fi

  ts="$(container_id_for_service timescaledb)"
  if [ -z "$ts" ]; then
    warn "TimescaleDB container unavailable; cannot confirm MQTT source history"
    return
  fi

  old_ifs="$IFS"
  IFS=', '
  for serial in $expected; do
    [ -n "$serial" ] || continue
    case "$serial" in
      *[!A-Za-z0-9_.:-]*) warn "skipping unsafe expected source identity"; continue ;;
    esac
    count="$(docker exec "$ts" psql -X -Atq -U site_mapper -d site_mapper_telemetry -c "SELECT count(*) FROM telemetry_samples WHERE source_identity='$serial';" 2>/dev/null || true)"
    case "$count" in
      ''|*[!0-9]*) warn "cannot query MQTT history for $serial" ;;
      0) warn "QDF source $serial not yet observed in TimescaleDB" ;;
      *) pass "QDF source $serial observed in TimescaleDB (rows=$count)" ;;
    esac
  done
  IFS="$old_ifs"
}

check_snmp() {
  echo
  echo "=== SNMP ==="

  version="$(env_value SNMP_VERSION 2>/dev/null || true)"
  host="$(env_value SNMP_CONTROLLER_HOST 2>/dev/null || true)"
  port="$(env_value SNMP_CONTROLLER_PORT 2>/dev/null || true)"
  points="$(env_value SNMP_FEED_POINTS_JSON 2>/dev/null || true)"
  port="${port:-161}"

  if [ -z "$host" ]; then
    warn "SNMP_CONTROLLER_HOST not present in base env; inspect per-controller services separately"
    return
  fi

  pass "SNMP target configured: $host:$port"

  if [ "$version" = "2c" ] && command -v snmpget >/dev/null 2>&1; then
    community="$(env_value SNMP_COMMUNITY 2>/dev/null || true)"
    oid="$(printf '%s' "$points" | sed -n 's/.*"oid"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
    if [ -n "$community" ] && [ -n "$oid" ]; then
      if timeout 5 snmpget -v2c -c "$community" -t 2 -r 0 "$host:$port" "$oid" >/dev/null 2>&1; then
        pass "SNMP v2c read-only GET succeeded for approved profile OID"
      else
        warn "SNMP v2c GET did not return; check routing/firewall/community/OID"
      fi
    else
      warn "SNMP GET skipped: community or approved OID unavailable"
    fi
  elif [ "$version" = "2c" ]; then
    warn "snmpget tool unavailable; no active SNMP GET performed"
  else
    info "active SNMP probe skipped for version=$version"
  fi
}

check_data() {
  echo
  echo "=== DATA STORES / HISTORY ==="

  mongo="$(container_id_for_service mongodb)"
  if [ -n "$mongo" ]; then
    if docker exec "$mongo" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok===1?0:1)' >/dev/null 2>&1; then
      pass "MongoDB ping"
    else
      fail "MongoDB ping failed"
    fi
  else
    warn "MongoDB container unavailable"
  fi

  ts="$(container_id_for_service timescaledb)"
  if [ -n "$ts" ]; then
    if docker exec "$ts" psql -X -Atq -U site_mapper -d site_mapper_telemetry -c 'SELECT 1;' 2>/dev/null | grep -qx '1'; then
      pass "TimescaleDB read query"
    else
      fail "TimescaleDB read query failed"
    fi
  else
    warn "TimescaleDB container unavailable"
  fi
}

check_modbus() {
  echo
  echo "=== MODBUS ==="

  units="$(env_value MODBUS_SOURCE_UNITS_JSON 2>/dev/null || true)"
  if [ -z "$units" ]; then
    fail "MODBUS_SOURCE_UNITS_JSON missing"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    result="$(FIELD_UNITS="$units" python3 - <<'PY'
import json, os, sys
try:
    data = json.loads(os.environ["FIELD_UNITS"])
    if not isinstance(data, dict) or not data:
        raise ValueError("map must be a non-empty object")
    vals = list(data.values())
    if any(not isinstance(v, int) or v < 1 or v > 247 for v in vals):
        raise ValueError("Unit IDs must be integers 1..247")
    if len(vals) != len(set(vals)):
        raise ValueError("duplicate Unit IDs")
    print("OK")
except Exception as exc:
    print(str(exc))
    sys.exit(1)
PY
)" && pass "Modbus source-to-unit map valid and Unit IDs unique" || fail "invalid Modbus source-to-unit map: $result"
  else
    warn "python3 unavailable; JSON/Unit ID uniqueness not validated"
  fi

  modbus_state="$(container_state_for_service modbus-tcp 2>/dev/null || true)"
  [ "$modbus_state" = "running" ] && pass "modbus-tcp container running" || warn "modbus-tcp container not running/found"

  modbus_port="$(env_value MODBUS_CLIENT_PORT 2>/dev/null || true)"
  modbus_port="${modbus_port:-1503}"
  if command -v ss >/dev/null 2>&1 && ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$modbus_port$"; then
    pass "Modbus TCP listener detected on port $modbus_port"
  else
    warn "Modbus TCP listener not detected on host port $modbus_port"
  fi
}

write_receipt() {
  [ "$WRITE_RECEIPT" -eq 1 ] || return 0

  umask 077
  if ! mkdir -p "$RECEIPT_DIR" 2>/dev/null; then
    warn "cannot create receipt directory: $RECEIPT_DIR"
    return 0
  fi

  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  file="$RECEIPT_DIR/$timestamp-field-check.txt"
  result="PASS"
  [ "$failures" -gt 0 ] && result="FAIL"
  [ "$failures" -eq 0 ] && [ "$warnings" -gt 0 ] && result="PASS_WITH_WARNINGS"

  {
    echo "SITE_MAPPER_FIELD_CHECK"
    echo "timestamp=$timestamp"
    echo "mode=$MODE"
    echo "result=$result"
    echo "checks=$checks"
    echo "failures=$failures"
    echo "warnings=$warnings"
    echo "secretsIncluded=false"
    echo
    printf '%s' "$receipt_lines"
  } > "$file"

  chmod 600 "$file" 2>/dev/null || true
  info "sanitized receipt written: $file"
}

case "$MODE" in
  vm) check_vm ;;
  config) check_config ;;
  services) check_services ;;
  mqtt) check_mqtt ;;
  snmp) check_snmp ;;
  data) check_data ;;
  modbus) check_modbus ;;
  all)
    check_vm
    check_config
    check_services
    check_mqtt
    check_snmp
    check_data
    check_modbus
    ;;
esac

write_receipt

echo
echo "================================================"
if [ "$failures" -gt 0 ]; then
  echo "RESULT: NOT_READY ($failures failure(s), $warnings warning(s))"
  exit 1
fi
if [ "$warnings" -gt 0 ]; then
  echo "RESULT: READY_WITH_WARNINGS ($warnings warning(s))"
  echo "FIELD/SAT acceptance still requires commissioning evidence."
  exit 0
fi
echo "RESULT: READY_FOR_COMMISSIONING"
echo "FIELD/SAT acceptance still requires commissioning evidence."
