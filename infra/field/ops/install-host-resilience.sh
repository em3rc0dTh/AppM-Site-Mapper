#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${S06_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
HOST="${S06_HOSTNAME:-sitemapper.thradex.home.arpa}"
ZONE="${S06_DNS_ZONE:-thradex.home.arpa}"
EXPECTED_IP="${S06_EXPECTED_IP:-192.168.10.1}"
BRIDGE="${S06_BRIDGE:-br-lab}"
PROJECT="${S06_COMPOSE_PROJECT:-appm-site-mapper}"
CADDY_UNIT="${S06_CADDY_SYSTEMD_UNIT:-caddy.service}"
KEA_PUBLISH="${S06_KEA_PUBLISH:-0}"

fail() { echo "S06_APPLY_ERROR: $*" >&2; exit 1; }
log() { printf '\n=== %s ===\n' "$*"; }

[[ "$(id -u)" -eq 0 ]] || fail "root is required"
[[ -d "$ROOT/.git" || -f "$ROOT/.git" ]] || fail "repository root not found"
[[ "$HOST" =~ ^[A-Za-z0-9.-]+$ ]] || fail "invalid hostname"
[[ "$ZONE" =~ ^[A-Za-z0-9.-]+$ ]] || fail "invalid DNS zone"
[[ "$BRIDGE" =~ ^[A-Za-z0-9_.:-]+$ ]] || fail "invalid bridge name"
python3 - "$EXPECTED_IP" <<'PY'
import ipaddress, sys
ipaddress.IPv4Address(sys.argv[1])
PY

for command in docker systemctl nmcli resolvectl dnsmasq curl getent python3; do
  command -v "$command" >/dev/null || fail "missing command: $command"
done

ip -4 -o addr show dev "$BRIDGE" | grep -Eq "[[:space:]]$EXPECTED_IP/" ||
  fail "$BRIDGE does not own expected address $EXPECTED_IP"

[[ "$KEA_PUBLISH" == "0" || "$KEA_PUBLISH" == "1" ]] || fail "S06_KEA_PUBLISH must be 0 or 1"

log "Preflight live Site Mapper industrial contract"
mapfile -t app_ids < <(docker ps -aq \
  --filter "label=com.docker.compose.project=$PROJECT" \
  --filter "label=com.docker.compose.service=site-mapper")
(("${#app_ids[@]}" == 1)) || fail "expected exactly one Site Mapper container for project $PROJECT"
docker inspect --format '{{json .Config.Env}}' "${app_ids[0]}" |
  python3 -c '
import json, sys
rows = json.load(sys.stdin)
env = {}
for row in rows:
    if "=" in row:
        key, value = row.split("=", 1)
        env[key] = value
sources_raw = env.get("INDUSTRIAL_INGEST_SOURCES_JSON")
profiles_raw = env.get("INDUSTRIAL_PROFILES_JSON")
if not sources_raw or not profiles_raw:
    raise SystemExit("industrial ingest environment is incomplete")
sources = json.loads(sources_raw)
profiles = json.loads(profiles_raw)
if not isinstance(sources, dict) or not sources:
    raise SystemExit("industrial source credentials mapping is invalid")
if not isinstance(profiles, list) or not profiles:
    raise SystemExit("industrial profiles mapping is invalid")
profile_sources = {row.get("sourceIdentity") for row in profiles if isinstance(row, dict)}
if not profile_sources or not profile_sources.issubset(set(sources)):
    raise SystemExit("industrial profile/source mapping is inconsistent")
' || fail "live Site Mapper industrial contract is invalid"
probe_code="$(curl -sS -o /tmp/site-mapper-s06-ingest-probe.json -w '%{http_code}' \
  --max-time 10 -X POST http://127.0.0.1:3000/api/telemetry/industrial/ingest \
  -H 'Authorization: Bearer definitely-invalid-probe-token' \
  -H 'Content-Type: application/json' --data '{}')" ||
  fail "industrial ingest preflight request failed"
rm -f /tmp/site-mapper-s06-ingest-probe.json
[[ "$probe_code" == "401" ]] ||
  fail "industrial ingest contract is not healthy (expected HTTP 401, got $probe_code)"

log "Install deterministic FIELD LAN DNS"
install -d -m 0755 /etc/site-mapper
dns_tmp="$(mktemp)"
trap 'rm -f "$dns_tmp" "${kea_tmp:-}"' EXIT
sed \
  -e "s/__S06_BRIDGE__/$BRIDGE/g" \
  -e "s/__S06_EXPECTED_IP__/$EXPECTED_IP/g" \
  -e "s/__S06_DNS_ZONE__/$ZONE/g" \
  -e "s/__S06_HOSTNAME__/$HOST/g" \
  "$ROOT/infra/field/ops/dnsmasq.conf.template" > "$dns_tmp"
/usr/sbin/dnsmasq --test --conf-file="$dns_tmp" >/dev/null
install -m 0644 "$dns_tmp" /etc/site-mapper/dnsmasq.conf
install -m 0644 "$ROOT/infra/field/ops/systemd/site-mapper-dns.service" \
  /etc/systemd/system/site-mapper-dns.service

log "Route the private zone through the FIELD bridge"
nmcli -t -f NAME connection show | grep -Fxq "$BRIDGE" || fail "NetworkManager connection $BRIDGE missing"
nmcli connection modify "$BRIDGE" ipv4.dns "$EXPECTED_IP" ipv4.dns-search "~$ZONE"
resolvectl dns "$BRIDGE" "$EXPECTED_IP"
resolvectl domain "$BRIDGE" "~$ZONE"
resolvectl flush-caches

log "Stage optional Kea DNS advertisement without restarting DHCP"
kea_file=/etc/kea/kea-dhcp4.conf
if [[ -f "$kea_file" ]]; then
  # Kea's confinement policy can reject configuration files under /tmp.
  # Validate the staged candidate from Kea's approved configuration directory.
  kea_tmp="$(mktemp /etc/kea/.site-mapper-s06.XXXXXX)"
  python3 - "$kea_file" "$kea_tmp" "$EXPECTED_IP" "$ZONE" <<'PY'
import ipaddress, json, pathlib, sys
source, target, dns_ip, zone = map(str, sys.argv[1:])
data = json.loads(pathlib.Path(source).read_text())
dhcp = data.get("Dhcp4")
if not isinstance(dhcp, dict):
    raise SystemExit("missing Dhcp4")
subnets = dhcp.get("subnet4")
if not isinstance(subnets, list):
    raise SystemExit("missing subnet4")
address = ipaddress.IPv4Address(dns_ip)
matches = []
for subnet in subnets:
    network = ipaddress.IPv4Network(subnet.get("subnet", ""), strict=False)
    if address in network:
        matches.append(subnet)
if len(matches) != 1:
    raise SystemExit("expected exactly one Kea subnet containing DNS address")
subnet = matches[0]
options = subnet.setdefault("option-data", [])
if not isinstance(options, list):
    raise SystemExit("invalid option-data")
options[:] = [item for item in options if item.get("name") not in {"domain-name-servers", "domain-search"}]
options.extend([
    {"name": "domain-name-servers", "data": dns_ip},
    {"name": "domain-search", "data": zone},
])
pathlib.Path(target).write_text(json.dumps(data, indent=2) + "\n")
PY
  chmod 0644 "$kea_tmp"
  kea-dhcp4 -t "$kea_tmp" >/dev/null
  install -m 0600 "$kea_tmp" /etc/site-mapper/kea-dhcp4.s06.candidate.json
  if [[ "$KEA_PUBLISH" == "1" ]]; then
    systemctl is-active --quiet kea-dhcp4-server &&
      fail "refusing to modify active Kea automatically; review candidate and reload in an approved FIELD window"
    if ! cmp -s "$kea_file" "$kea_tmp"; then
      [[ -e "$kea_file.pre-s06-dns" ]] || cp -a "$kea_file" "$kea_file.pre-s06-dns"
      install -m 0644 "$kea_tmp" "$kea_file"
    fi
  else
    log "Kea candidate staged only; live DHCP configuration was not modified"
  fi
fi

log "Install selective watchdog"
install -d -m 0755 /usr/local/lib/site-mapper
install -m 0755 "$ROOT/infra/field/ops/watchdog.py" /usr/local/lib/site-mapper/watchdog.py
install -m 0644 "$ROOT/infra/field/ops/systemd/site-mapper-watchdog.service" \
  /etc/systemd/system/site-mapper-watchdog.service
install -m 0644 "$ROOT/infra/field/ops/systemd/site-mapper-watchdog.timer" \
  /etc/systemd/system/site-mapper-watchdog.timer
cat > /etc/site-mapper/watchdog.env <<EOF
S06_COMPOSE_PROJECT=$PROJECT
S06_HOSTNAME=$HOST
S06_EXPECTED_IP=$EXPECTED_IP
S06_WATCHDOG_STATE=/var/lib/site-mapper/watchdog.json
S06_WATCHDOG_RECOVERY_ENABLED=1
S06_CADDY_MODE=systemd
S06_CADDY_SYSTEMD_UNIT=$CADDY_UNIT
S06_DNS_SYSTEMD_UNIT=site-mapper-dns.service
EOF
chmod 0600 /etc/site-mapper/watchdog.env

log "Close boot/restart contract"
systemctl enable --now docker.service
systemctl enable --now "$CADDY_UNIT"
docker update --restart unless-stopped "${app_ids[0]}" >/dev/null
[[ "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "${app_ids[0]}")" == "unless-stopped" ]] ||
  fail "Site Mapper restart policy was not applied"

systemctl daemon-reload
# Keep watchdog recovery quiescent until DNS and trusted HTTPS have passed
# acceptance. This prevents a partially applied host change from consuming
# recovery attempts or persisting a stale lockout.
systemctl disable --now site-mapper-watchdog.timer >/dev/null 2>&1 || true
systemctl stop site-mapper-watchdog.service >/dev/null 2>&1 || true
systemctl enable --now site-mapper-dns.service

log "Acceptance"
for _ in $(seq 1 20); do
  resolved="$(getent ahostsv4 "$HOST" | awk 'NR==1 {print $1}')"
  [[ "$resolved" == "$EXPECTED_IP" ]] && break
  resolvectl flush-caches
  sleep 1
done
[[ "${resolved:-}" == "$EXPECTED_IP" ]] || fail "$HOST did not resolve to $EXPECTED_IP"
curl -fsS --max-time 10 "https://$HOST/api/health" >/dev/null ||
  fail "trusted HTTPS health check failed"

# A successful, explicit operator APPLY is the recovery boundary that may clear
# an old watchdog lockout. Ordinary watchdog/service restarts never clear it.
install -d -m 0700 /var/lib/site-mapper
rm -f /var/lib/site-mapper/watchdog.json
systemctl reset-failed site-mapper-watchdog.service >/dev/null 2>&1 || true
systemctl start site-mapper-watchdog.service
python3 - /var/lib/site-mapper/watchdog.json <<'PY'
import json, pathlib, sys
state = json.loads(pathlib.Path(sys.argv[1]).read_text())
if state.get("lockout") is not False:
    raise SystemExit("watchdog lockout remained set after successful operator APPLY")
PY
systemctl enable --now site-mapper-watchdog.timer
systemctl is-active --quiet site-mapper-dns.service || fail "DNS service is not active"
systemctl is-active --quiet site-mapper-watchdog.timer || fail "watchdog timer is not active"

cat > /var/lib/site-mapper/resilience-receipt.txt <<EOF
status=S06_HOST_RESILIENCE_APPLIED
hostname=$HOST
dns=$EXPECTED_IP
dnsService=active
watchdog=active
watchdogRecovery=enabled
watchdogLockout=false
dockerBoot=enabled
siteMapperRestart=unless-stopped
caddyUnit=$CADDY_UNIT
https=PASS
appliedAt=$(date -u +%FT%TZ)
EOF
chmod 0600 /var/lib/site-mapper/resilience-receipt.txt
cat /var/lib/site-mapper/resilience-receipt.txt