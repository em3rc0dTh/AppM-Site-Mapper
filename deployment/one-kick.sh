#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RECOVERY=""
PASSPHRASE_FILE=""
PROFILE_OUT="/etc/tfarm/profile.json"
SKIP_HOST=0
SKIP_NETWORK=0

die(){ printf 'ONE_KICK_FAIL %s\n' "$*" >&2; exit 1; }
log(){ printf '\n==> %s\n' "$*"; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --recovery) RECOVERY="${2:-}"; shift 2;;
    --passphrase-file) PASSPHRASE_FILE="${2:-}"; shift 2;;
    --skip-host-provision) SKIP_HOST=1; shift;;
    --skip-network) SKIP_NETWORK=1; shift;;
    *) die "unknown argument: $1";;
  esac
done

[ "$(id -u)" -eq 0 ] || die "run with sudo/root"
[ -n "$RECOVERY" ] && [ -f "$RECOVERY" ] || die "--recovery FILE is required"
case "$(uname -m)" in x86_64|amd64) ;; *) die "x86_64/amd64 required";; esac

if [ "$SKIP_HOST" -eq 0 ]; then
  . /etc/os-release
  [ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] || die "Ubuntu 24.04 required"
  log "Installing host prerequisites"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl gnupg git python3 network-manager kea-dhcp4-server snmp
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -s /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  cat >/etc/apt/sources.list.d/docker.sources <<EOT
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOT
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker NetworkManager
fi

for exe in python3 docker gpg tar nmcli ip; do command -v "$exe" >/dev/null || die "missing $exe"; done
docker version >/dev/null
docker compose version >/dev/null

TMP="$(mktemp -d /var/tmp/tfarm-one-kick.XXXXXX)"
cleanup(){ rm -rf "$TMP"; }
trap cleanup EXIT
mkdir -p "$TMP/unpacked"

log "Decrypting recovery bundle"
if [ -n "$PASSPHRASE_FILE" ]; then
  [ -f "$PASSHRASE_FILE" ] || die "passphrase file missing"
  [ $(( 8#$(stat -c '%a' "$PASSHRASE_FILE") & 077 )) -eq 0 ] || die "passphrase file must be mode 0600"
  gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" --decrypt "$RECOVERY" |
    tar -xpf - -C "$TMP/unpacked"
else
  gpg --decrypt "$RECOVERY" | tar -xpf - -C "$TMP/unpacked"
fi

python3 "$ROOT/deployment/tfarmctl" --root "$ROOT" verify --directory "$TMP/unpacked"

log "Discovering network roles"
if [ "$SKIP_NETWORK" -eq 1 ]; then
  WAN="$(python3 -c 'import json; p=json.load(open("'"$TMP'/unpacked/profile.json")); print(p["network"]["wan"])')"
  LAN_JSON="$(python3 -c 'import json; p=json.load(open("'"$TMP'/unpacked/profile.json")); print(json.dumps(p["network"]["lan"]))')"
else
  WAN="$(ip -j route show default | python3 -c 'import json,sys; r=json.load(sys.stdin); d=sorted({x.get("dev") for x in r if x.get("dev")}); print(d[0] if len(d)==1 else "")')"
  [ -n "$WAN" ] || die "exactly one IPv4 default-route interface is required"

  LAN_JSON="$(python3 - "$WAN" <<'PY'
import json, pathlib, subprocess, sys, collections
wan=sys.argv[1]
links=json.loads(subprocess.check_output(["ip","-j","link","show"],text=True))
groups=collections.defaultdict(list)
for x in links:
    n=x["ifname"]
    p=pathlib.Path("/sys/class/net",n)
    if n==wan or not (p/"device").exists() or (p/"wireless").exists():
        continue
    try:
        vendor=(p/"device/vendor").read_text().strip()
        device=(p/"device/device").read_text().strip()
    except OSError:
        continue
    groups[(vendor,device)].append(n)
groups={k:sorted(v) for k,v in groups.items() if len(v)>=2}
if not groups:
    candidates=[]
    for x in links:
        n=x["ifname"]; p=pathlib.Path("/sys/class/net",n)
        if n!=wan and (p/"device").exists() and not (p/"wireless").exists():
            candidates.append(n)
    if len(candidates)==1:
        print(json.dumps(candidates)); raise SystemExit
    raise SystemExit(2)
best=max(groups.values(),key=lambda v:(len(v),v))
if sum(1 for v in groups.values() if len(v)==len(best))>1:
    raise SystemExit(3)
print(json.dumps(best))
PY
)" || die "cannot unambiguously select industrial Ethernet group"
  [ "$LAN_JSON" != "[]" ] || die "no industrial LAN interfaces detected"
fi

install -d -m 0700 /etc/tfarm
python3 - "$TMP/unpacked/profile.json" "$PROFILE_OUT" "$WAN" "$LAN_JSON" <<'PY'
import json,sys,os,tempfile
src,dst,wan,lan=sys.argv[1:]
p=json.load(open(src))
p["network"]["wan"]=wan
p["network"]["lan"]=json.loads(lan)
fd,tmp=tempfile.mkstemp(dir="/etc/tfarm",prefix=".profile.",text=True)
with os.fdopen(fd,"w") as f: json.dump(p,f,indent=2); f.write("\n")
os.chmod(tmp,0o600); os.replace(tmp,dst)
PY

if [ "$SKIP_NETWORK" -eq 0 ]; then
  log "Configuring isolated industrial bridge and DHCP"
  systemctl stop kea-dhcp4-server 2>/dev/null || true
  python3 "$ROOT/deployment/tfarmctl" --root "$ROOT" --profile "$PROFILE_OUT" network --apply --local-console
fi

log "Restoring Site Mapper"
python3 "$ROOT/deployment/tfarmctl" --root "$ROOT" --profile "$PROFILE_OUT" restore --directory "$TMP/unpacked" --apply

log "Applying host-specific runtime bindings"
python3 - "$ROOT/.runtime/office-test.env" "$PROFILE_OUT" <<'PY'
import ipaddress,json,os,sys,tempfile
env,profile=sys.argv[1:]
p=json.load(open(profile)); ip=str(ipaddress.IPv4Interface(p["network"]["address"]).ip)
wanted={"SNMP_TRAP_HOST_BIND":ip,"SNMP_TRAP_HOST_PORT":"162",
        "MQTT_LAN_BIND_HOST":ip,"MQTT_LAN_PORT":"1883",
        "MODBUS_CLIENT_BIND_HOST":ip,"MODBUS_CLIENT_PORT":"502"}
lines=open(env).read().splitlines(); seen=set(); out=[]
for line in lines:
    if "=" in line and not line.lstrip().startswith("#"):
        key=line.split("=",1)[0].strip()
        if key in wanted:
            out.append(key+"="+wanted[key]); seen.add(key); continue
    out.append(line)
for key,val in wanted.items():
    if key not in seen: out.append(key+"="+val)
fd,tmp=tempfile.mkstemp(dir=os.path.dirname(env),prefix=".office-test.",text=True)
with os.fdopen(fd,"w") as f: f.write("\n".join(out)+"\n")
os.chmod(tmp,0o600); os.replace(tmp,env)
PY

python3 "$ROOT/deployment/tfarmctl" --root "$ROOT" --profile "$PROFILE_OUT" preflight
python3 "$ROOT/deployment/tfarmctl" --root "$ROOT" --profile "$PROFILE_OUT" start

log "Waiting for Site Mapper"
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:3000/login >/dev/null 2>&1; then break; fi
  [ "$i" -lt 90 ] || die "Site Mapper HTTP did not become ready"
  sleep 2
done

python3 "$ROOT/deployment/tfarmctl" --root "$ROOT" --profile "$PROFILE_OUT" validate

if [ "$SKIP_HOST" -eq 0 ]; then
  log "Installing boot service"
  sed -e "s#/opt/AppM-Site-Mapper#$ROOT#g" \
      -e "s#/etc/tfarm/profile.json#$PROFILE_OUT#g" \
      "$ROOT/deployment/systemd/tfarm.service.example" >/etc/systemd/system/site-mapper-tfarm.service
  systemctl daemon-reload
  systemctl enable site-mapper-tfarm.service
fi

log "Final host checks"
BRIDGE_IP="$(python3 -c 'import json,ipaddress; p=json.load(open("'"$PROFILE_OUT"'")); print(ipaddress.IPv4Interface(p["network"]["address"]).ip)')"
ss -H -lun | grep -F "$BRIDGE_IP:162" >/dev/null || die "SNMP trap UDP/162 not listening"
ss -H -lnt | grep -F "$BRIDGE_IP:1883" >/dev/null || die "MQTT TCP/1883 not listening"
ss -H -lnt | grep -F "$BRIDGE_IP:502" >/dev/null || die "Modbus TCP/502 not listening"
printf '\nONE_KICK_OK Site Mapper restored and started. bridge=%s wan=%s lan=%s\n' "$BRIDGE_IP" "$WAN" "$LAN_JSON"
