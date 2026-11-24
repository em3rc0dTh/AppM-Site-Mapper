#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

KIT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
APP_ROOT="$PWD"
OUTPUT=""
STAGING=""
PASSPHRASE_FILE=""
PROJECT="appm-site-mapper"
PROFILE_DIR=""
PROFILE=""
VERIFY_DIR=""
RESTART_ARMED=0
declare -a RUNNING_IDS=()
declare -A SERVICE_ID=()

die(){ printf 'LIVE_RECOVERY_FAIL %s\n' "$*" >&2; exit 1; }
log(){ printf '\n==> %s\n' "$*"; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --root) APP_ROOT="${2:-}"; shift 2;;
    --output) OUTPUT="${2:-}"; shift 2;;
    --staging) STAGING="${2:-}"; shift 2;;
    --passphrase-file) PASSPHRASE_FILE="${2:-}"; shift 2;;
    *) die "unknown argument: $1";;
  esac
done

[ "$(id -u)" -eq 0 ] || die "run with sudo/root"
APP_ROOT="$(readlink -f "$APP_ROOT")"
[ -d "$APP_ROOT/.git" ] || die "application checkout not found"
[ -f "$APP_ROOT/.runtime/office-test.env" ] || die "private runtime env missing"
[ $(( 8#$(stat -c '%a' "$APP_ROOT/.runtime/office-test.env") & 077 )) -eq 0 ] ||
  die "runtime env must be mode 0600"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="${OUTPUT:-$APP_ROOT/SiteMapper-Recovery-$STAMP.tar.gpg}"
STAGING="${STAGING:-$APP_ROOT/.runtime/recovery-staging}"
OUTPUT="$(readlink -m "$OUTPUT")"
STAGING="$(readlink -m "$STAGING")"
[ ! -e "$OUTPUT" ] || die "output already exists"
install -d -m 0700 "$STAGING"
PROFILE_DIR="$(mktemp -d "$STAGING/live-profile.XXXXXX")"
PROFILE="$PROFILE_DIR/profile.json"
VERIFY_DIR="$(mktemp -d "$STAGING/live-verify.XXXXXX")"

if [ -n "$PASSPHRASE_FILE" ]; then
  PASSPHRASE_FILE="$(readlink -f "$PASSPHRASE_FILE")"
  [ -f "$PASSPHRASE_FILE" ] || die "passphrase file missing"
  [ $(( 8#$(stat -c '%a' "$PASSPHRASE_FILE") & 077 )) -eq 0 ] ||
    die "passphrase file must be mode 0600"
fi

cleanup(){
  rm -rf "$PROFILE_DIR" "$VERIFY_DIR"
}
trap cleanup EXIT

log "Capturing deterministic Site Mapper host profile"
python3 - "$KIT_ROOT/deployment/profiles/tfarm.example.json" "$PROFILE" <<'PY'
import json, pathlib, subprocess, sys
src,dst=sys.argv[1:]
p=json.load(open(src))
routes=json.loads(subprocess.check_output(["ip","-j","route","show","default"],text=True))
wan=sorted({x.get("dev") for x in routes if x.get("dev")})
if len(wan)!=1:
    raise SystemExit("exactly one default-route interface is required")
bridge=p["network"]["bridge"]
rows=json.loads(subprocess.check_output(["ip","-j","-4","address","show","dev",bridge],text=True))
addresses=[a for row in rows for a in row.get("addr_info",[]) if a.get("family")=="inet"]
if len(addresses)!=1:
    raise SystemExit("exactly one IPv4 bridge address is required")
links=subprocess.check_output(["bridge","link","show"],text=True).splitlines()
lan=[]
for line in links:
    if f"master {bridge}" not in line:
        continue
    name=line.split(":",2)[1].strip().split("@",1)[0]
    if pathlib.Path("/sys/class/net",name,"device").exists():
        lan.append(name)
if not lan:
    raise SystemExit("no physical industrial bridge ports found")
p["network"]["wan"]=wan[0]
p["network"]["lan"]=sorted(set(lan))
p["network"]["address"]=f'{addresses[0]["local"]}/{addresses[0]["prefixlen"]}'
json.dump(p,open(dst,"w"),indent=2)
open(dst,"a").write("\n")
PY
chmod 600 "$PROFILE"

python3 "$KIT_ROOT/deployment/tfarmctl" --root "$APP_ROOT" --profile "$PROFILE" preflight

mapfile -t RUNNING_IDS < <(
  docker ps -q --filter "label=com.docker.compose.project=$PROJECT"
)
[ "${#RUNNING_IDS[@]}" -gt 0 ] || die "no running Site Mapper containers found"

for id in "${RUNNING_IDS[@]}"; do
  service="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$id")"
  [ -n "$service" ] || die "project container without Compose service label"
  SERVICE_ID["$service"]="$id"
done

start_service(){
  local name="$1" id="${SERVICE_ID[$1]:-}"
  [ -n "$id" ] || return 0
  if ! docker inspect -f '{{.State.Running}}' "$id" 2>/dev/null | grep -qx true; then
    docker start "$id" >/dev/null
  fi
}

wait_healthy(){
  local name="$1" id="${SERVICE_ID[$1]:-}" state health
  [ -n "$id" ] || return 0
  for _ in $(seq 1 90); do
    state="$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null || true)"
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || true)"
    if [ "$state" = running ] && { [ "$health" = healthy ] || [ "$health" = none ]; }; then return 0; fi
    sleep 1
  done
  return 1
}

restart_prior(){
  [ "$RESTART_ARMED" -eq 1 ] || return 0
  set +e
  log "Restarting the exact containers that were running before capture"
  start_service mongodb
  start_service timescaledb
  wait_healthy mongodb
  wait_healthy timescaledb
  start_service mosquitto
  start_service telemetry-store
  wait_healthy mosquitto
  start_service site-mapper
  for _ in $(seq 1 90); do
    curl -fsS http://127.0.0.1:3000/login >/dev/null 2>&1 && break
    sleep 1
  done
  start_service modbus-tcp
  for id in "${RUNNING_IDS[@]}"; do
    service="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$id" 2>/dev/null || true)"
    case "$service" in
      mongodb|timescaledb|mosquitto|telemetry-store|site-mapper|modbus-tcp) ;;
      *) docker start "$id" >/dev/null 2>&1 || true ;;
    esac
  done
  RESTART_ARMED=0
  set -e
}
trap 'rc=$?; restart_prior; cleanup; exit $rc' EXIT
RESTART_ARMED=1

stop_service(){
  local name="$1" id="${SERVICE_ID[$1]:-}"
  [ -n "$id" ] || return 0
  docker stop -t 45 "$id" >/dev/null
}

log "Entering controlled Site Mapper backup window"
for s in snmp-traps snmp-collector office-snmp-collector-qdf4-real office-snmp-collector-qdf5-real; do stop_service "$s"; done
for s in site-mapper modbus-tcp telemetry-store mosquitto; do stop_service "$s"; done
for id in "${RUNNING_IDS[@]}"; do
  service="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$id")"
  case "$service" in
    mongodb|timescaledb|snmp-traps|snmp-collector|office-snmp-collector-qdf4-real|office-snmp-collector-qdf5-real|site-mapper|modbus-tcp|telemetry-store|mosquitto) ;;
    *) docker stop -t 45 "$id" >/dev/null ;;
  esac
done
stop_service timescaledb
stop_service mongodb

remaining="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT")"
[ -z "$remaining" ] || die "not all Site Mapper project containers stopped"

if [ -n "$PASSPHRASE_FILE" ]; then
  TFARM_GPG_PASSPHRASE_FILE="$PASSPHRASE_FILE" \
    python3 "$KIT_ROOT/deployment/tfarmctl" --root "$APP_ROOT" --profile "$PROFILE" \
      backup --staging "$STAGING" --output "$OUTPUT"
else
  python3 "$KIT_ROOT/deployment/tfarmctl" --root "$APP_ROOT" --profile "$PROFILE" \
    backup --staging "$STAGING" --output "$OUTPUT"
fi

log "Verifying encrypted recovery artifact"
rm -rf "$VERIFY_DIR"
install -d -m 0700 "$VERIFY_DIR"
if [ -n "$PASSPHRASE_FILE" ]; then
  gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" \
    --decrypt "$OUTPUT" | tar -xpf - -C "$VERIFY_DIR"
else
  gpg --decrypt "$OUTPUT" | tar -xpf - -C "$VERIFY_DIR"
fi
python3 "$KIT_ROOT/deployment/tfarmctl" --root "$APP_ROOT" verify --directory "$VERIFY_DIR"
sha256sum "$OUTPUT" >"$OUTPUT.sha256"
chmod 600 "$OUTPUT" "$OUTPUT.sha256"

restart_prior

log "Post-backup Site Mapper checks"
curl -fsS http://127.0.0.1:3000/login >/dev/null
BRIDGE_IP="$(python3 - "$PROFILE" <<'PY'
import ipaddress,json,sys
p=json.load(open(sys.argv[1]))
print(ipaddress.IPv4Interface(p["network"]["address"]).ip)
PY
)"
ss -H -lun | grep -F "$BRIDGE_IP:162" >/dev/null || die "SNMP UDP/162 did not return"
ss -H -lnt | grep -F "$BRIDGE_IP:1883" >/dev/null || die "MQTT TCP/1883 did not return"

if [ -n "${SUDO_UID:-}" ] && [ -n "${SUDO_GID:-}" ]; then
  chown "$SUDO_UID:$SUDO_GID" "$OUTPUT" "$OUTPUT.sha256"
fi

printf '\nLIVE_RECOVERY_OK\nartifact=%s\nsha256=%s\n' "$OUTPUT" "$(cut -d' ' -f1 "$OUTPUT.sha256")"
