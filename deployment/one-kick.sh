#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-}"
shift || true
CI_MODE=false
BUNDLE=""
PROFILE=""

usage() {
  cat <<'EOF'
Usage:
  sudo ./deployment/one-kick.sh lab [--ci]
  sudo ./deployment/one-kick.sh recover --bundle /path/to/site-mapper-recovery.tar.gpg [--profile /path/to/profile.json]

lab:
  Starts the complete self-contained Site Mapper integration stack from an empty
  Docker project and certifies MQTT, SNMP polling, SNMP traps, MongoDB,
  TimescaleDB, Modbus TCP, application restart and isolated backup/restore.

recover:
  Restores a trusted encrypted TFARM Recovery Bundle onto a clean Ubuntu 24.04
  host. Internet/WAN must already work. If the industrial bridge does not exist,
  the script performs one interactive LAN-interface selection inside this same
  command, then configures the bridge/DHCP and restores the runtime.

No patching or follow-up shell commands are part of either path.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ci) CI_MODE=true; shift ;;
    --bundle) BUNDLE="${2:-}"; shift 2 ;;
    --profile) PROFILE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
done

[[ "$MODE" == "lab" || "$MODE" == "recover" ]] || { usage >&2; exit 64; }
[[ "$(uname -m)" == "x86_64" ]] || { echo "TFARM_ERROR: x86_64 required" >&2; exit 1; }
[[ "$(id -u)" -eq 0 ]] || { echo "TFARM_ERROR: run with sudo/root" >&2; exit 1; }

log() { printf '\n=== %s ===\n' "$*"; }
fail() { echo "TFARM_ERROR: $*" >&2; exit 1; }

require_ubuntu_2404() {
  [[ -r /etc/os-release ]] || fail "missing /etc/os-release"
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] ||
    fail "Ubuntu 24.04 required (found ${ID:-unknown} ${VERSION_ID:-unknown})"
}

install_host_dependencies() {
  if [[ "${TFARM_SKIP_PACKAGES:-0}" == "1" ]]; then
    command -v docker >/dev/null || fail "docker missing while TFARM_SKIP_PACKAGES=1"
    docker compose version >/dev/null
    return
  fi
  "$ROOT/deployment/bootstrap-host.sh"
}

lab_dc() {
  docker compose --project-name "$COMPOSE_PROJECT_NAME"     --env-file "$ROOT/infra/integration/integration.env"     -f "$ROOT/docker-compose.telemetry.yml"     -f "$ROOT/docker-compose.integration.yml" "$@"
}

wait_for() {
  local label="$1" max="$2"
  shift 2
  local n
  for n in $(seq 1 "$max"); do
    if "$@"; then
      echo "PASS $label"
      return 0
    fi
    sleep 2
  done
  echo "FAIL $label" >&2
  return 1
}

lab_bootstrap_done() {
  local id state code
  id="$(lab_dc ps -aq integration-bootstrap)"
  [[ -n "$id" ]] || return 1
  state="$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null || true)"
  code="$(docker inspect -f '{{.State.ExitCode}}' "$id" 2>/dev/null || echo 99)"
  [[ "$state" == "exited" && "$code" == "0" ]]
}

lab_http_ok() {
  curl -fsS http://127.0.0.1:3000/api/health >/dev/null
}

lab_mqtt_ok() {
  local rows
  rows="$(lab_dc exec -T timescaledb psql -U site_mapper -d site_mapper_telemetry -Atc     "SELECT count(*) FROM telemetry_samples WHERE source_identity IN ('26092403950004','26092403950002');" 2>/dev/null || echo 0)"
  [[ "${rows:-0}" -gt 0 ]]
}

lab_snmp_ok() {
  local service
  for service in snmp-collector-qdf2 snmp-collector-qdf4 snmp-collector-qdf5; do
    lab_dc logs --no-color "$service" 2>&1 | grep -q 'snmp.poll.accepted' || return 1
  done
  local rows
  rows="$(lab_dc exec -T timescaledb psql -U site_mapper -d site_mapper_telemetry -Atc     "SELECT count(*) FROM telemetry_entity_samples WHERE target_type='ACCESS_PORT' AND source_identity LIKE 'INT-SNMP-QDF-%';" 2>/dev/null || echo 0)"
  [[ "${rows:-0}" -gt 0 ]]
}

lab_trap_ok() {
  lab_dc logs --no-color snmp-traps 2>&1 | grep -q '"event":"trap.delivery.committed"' || return 1
  local mongo_rows sql_rows
  mongo_rows="$(lab_dc exec -T mongodb mongosh --quiet seed-01 --eval     'print(db.industrial_events.countDocuments({sourceIdentity:"INT-TRAP-QDF-2",protocol:"SNMP"}));' | tail -n 1)"
  [[ "${mongo_rows:-0}" -gt 0 ]] || return 1
  sql_rows="$(lab_dc exec -T timescaledb psql -U site_mapper -d site_mapper_telemetry -Atc     "SELECT count(*) FROM industrial_observations WHERE source_identity='INT-TRAP-QDF-2' AND protocol='SNMP';" 2>/dev/null || echo 0)"
  [[ "${sql_rows:-0}" -gt 0 ]]
}

lab_modbus_ok() {
  lab_dc exec -T modbus-tcp node -e '
    const m=JSON.parse(process.env.MODBUS_SOURCE_UNITS_JSON||"{}");
    if(m["26092403950003"]!==1 || m["26092403950004"]!==2 || m["26092403950002"]!==3) process.exit(1);
  ' >/dev/null
}

run_lab() {
  install_host_dependencies
  cd "$ROOT"
  command -v git >/dev/null || fail "git missing"
  mkdir -p artifacts/one-kick
  COMPOSE_PROJECT_NAME="uat-onekick-${GITHUB_RUN_ID:-local}"
  export COMPOSE_PROJECT_NAME

  cleanup_failed() {
    local rc=$?
    if [[ $rc -ne 0 ]]; then
      mkdir -p artifacts/one-kick
      lab_dc ps -a > artifacts/one-kick/ps-failure.txt 2>&1 || true
      lab_dc logs --no-color --tail=300 > artifacts/one-kick/logs-failure.txt 2>&1 || true
      echo "ONE_KICK_LAB_FAIL rc=$rc" >&2
    fi
    exit $rc
  }
  trap cleanup_failed ERR

  log "Clean project"
  lab_dc down -v --remove-orphans >/dev/null 2>&1 || true

  log "Build and start complete Site Mapper stack"
  lab_dc up -d --build

  log "Wait for complete application bootstrap"
  wait_for "integration bootstrap" 90 lab_bootstrap_done
  wait_for "Site Mapper health" 90 lab_http_ok
  wait_for "MQTT durable history" 60 lab_mqtt_ok
  wait_for "SNMP polling and history" 60 lab_snmp_ok
  wait_for "SNMP trap Mongo+Timescale persistence" 60 lab_trap_ok
  wait_for "Modbus map" 15 lab_modbus_ok

  if lab_dc config --services | grep -qx operational-console; then
    fail "retired operational-console present"
  fi

  log "Restart and isolated backup/restore certification"
  bash scripts/ci/uat-full-stack-evidence.sh --isolated-lab

  wait_for "Site Mapper final health" 90 lab_http_ok
  wait_for "MQTT final history" 60 lab_mqtt_ok
  wait_for "SNMP final polling" 60 lab_snmp_ok
  wait_for "SNMP final trap persistence" 60 lab_trap_ok
  wait_for "Modbus final map" 15 lab_modbus_ok

  local sha
  sha="$(git rev-parse HEAD)"
  cat > artifacts/one-kick/receipt.txt <<EOF
status=ONE_KICK_LAB_CERTIFIED
gitSha=$sha
project=$COMPOSE_PROJECT_NAME
ubuntuTarget=24.04
architecture=x86_64
mqtt=PASS
snmpPolling=PASS
snmpTrapsMongo=PASS
snmpTrapsTimescale=PASS
mongodb=PASS
timescaledb=PASS
modbus=PASS
applicationRestart=PASS
isolatedBackupRestore=PASS
certifiedAt=$(date -u +%FT%TZ)
EOF
  lab_dc ps -a > artifacts/one-kick/services-final.txt
  echo "ONE_KICK_LAB_CERTIFIED gitSha=$sha"

  if [[ "$CI_MODE" == "true" ]]; then
    lab_dc down -v --remove-orphans
  fi
}

safe_extract_bundle() {
  local bundle="$1" destination="$2" tarfile
  tarfile="$(mktemp --tmpdir="$destination" encrypted-bundle.XXXXXX.tar)"
  gpg --decrypt "$bundle" > "$tarfile"
  python3 - "$tarfile" <<'PY'
import sys,tarfile,pathlib
p=sys.argv[1]
with tarfile.open(p) as t:
    for m in t.getmembers():
        n=pathlib.PurePosixPath(m.name)
        if n.is_absolute() or ".." in n.parts:
            raise SystemExit("unsafe recovery archive path")
PY
  tar -xf "$tarfile" -C "$destination"
  rm -f "$tarfile"
}

select_recovery_network() {
  local source_profile="$1" output_profile="$2"
  local wan
  wan="$(ip -4 route show default | awk 'NR==1 {print $5}')"
  [[ -n "$wan" ]] || fail "no IPv4 default-route interface"

  mapfile -t candidates < <(
    for p in /sys/class/net/*; do
      n="$(basename "$p")"
      [[ "$n" == "$wan" || "$n" == "lo" ]] && continue
      [[ -e "$p/device" ]] || continue
      [[ -d "$p/wireless" || -d "$p/phy80211" ]] && continue
      [[ "$(cat "$p/type" 2>/dev/null || true)" == "1" ]] || continue
      echo "$n"
    done
  )
  ((${#candidates[@]} > 0)) || fail "no physical Ethernet candidates for industrial LAN"

  echo "WAN detected: $wan"
  echo "Industrial LAN candidates:"
  local i
  for i in "${!candidates[@]}"; do printf '  [%d] %s\n' "$((i+1))" "${candidates[$i]}"; done

  local selected
  if [[ -n "${TFARM_LAN_INTERFACES:-}" ]]; then
    selected="$TFARM_LAN_INTERFACES"
    echo "LAN selection supplied by TFARM_LAN_INTERFACES: $selected"
  else
    read -r -p "Select LAN interface numbers separated by spaces: " selected
    local numbers=() token
    for token in $selected; do
      [[ "$token" =~ ^[0-9]+$ ]] || fail "invalid LAN selection"
      (( token >= 1 && token <= ${#candidates[@]} )) || fail "LAN selection out of range"
      numbers+=("${candidates[$((token-1))]}")
    done
    ((${#numbers[@]} > 0)) || fail "at least one LAN interface required"
    selected="${numbers[*]}"
  fi

  python3 - "$source_profile" "$output_profile" "$wan" "$selected" <<'PY'
import json,sys
src,out,wan,selected=sys.argv[1:5]
p=json.load(open(src))
p["network"]["wan"]=wan
p["network"]["lan"]=selected.split()
json.dump(p,open(out,"w"),indent=2)
open(out,"a").write("\n")
PY
  chmod 600 "$output_profile"
}

run_recover() {
  [[ -n "$BUNDLE" ]] || fail "--bundle is required"
  [[ -f "$BUNDLE" ]] || fail "recovery bundle not found"
  install_host_dependencies
  require_ubuntu_2404
  cd "$ROOT"

  local tmp
  tmp="$(mktemp -d /var/tmp/site-mapper-recovery.XXXXXX)"
  chmod 700 "$tmp"
  cleanup_recovery() { rm -rf "$tmp"; }
  trap cleanup_recovery EXIT

  log "Decrypt and verify trusted recovery bundle"
  safe_extract_bundle "$BUNDLE" "$tmp"
  python3 deployment/tfarmctl --root "$ROOT" verify --directory "$tmp"

  local effective_profile
  effective_profile="$tmp/effective-profile.json"
  if [[ -n "$PROFILE" ]]; then
    cp "$PROFILE" "$effective_profile"
    chmod 600 "$effective_profile"
  else
    if ip -4 addr show br-lab >/dev/null 2>&1; then
      cp "$tmp/profile.json" "$effective_profile"
      chmod 600 "$effective_profile"
    else
      select_recovery_network "$tmp/profile.json" "$effective_profile"
      systemctl stop kea-dhcp4-server >/dev/null 2>&1 || true
      python3 deployment/tfarmctl --root "$ROOT" --profile "$effective_profile" network --apply --local-console
    fi
  fi

  log "Restore exact images, volumes, databases, spools and private runtime"
  python3 deployment/tfarmctl --root "$ROOT" --profile "$effective_profile" restore --directory "$tmp" --apply

  log "Start complete Site Mapper runtime"
  python3 deployment/tfarmctl --root "$ROOT" --profile "$effective_profile" start

  log "Validate declared runtime"
  python3 deployment/tfarmctl --root "$ROOT" --profile "$effective_profile" validate

  echo "ONE_KICK_RECOVERY_COMPLETE"
  echo "Field devices may now be connected/commissioned against the restored site profile."
}

case "$MODE" in
  lab) run_lab ;;
  recover) run_recover ;;
esac
