#!/bin/sh
# Sprint 06 FULL LOCAL engineering acceptance.
# Certifies repository/runtime mechanics only; FIELD DNS/firewall/reboot/Cloudflare remain pending.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
RUNTIME="$ROOT_DIR/.runtime/s06-local"
RECEIPT="$RUNTIME/SPRINT-06-LOCAL-ACCEPTANCE.txt"
S00_RECEIPT="$ROOT_DIR/.runtime/s00-local/SPRINT-00-ACCEPTANCE.txt"
S00_BACKUP="$ROOT_DIR/.runtime/s00-local/backup"

SUFFIX="$$"
UPSTREAM="site-mapper-s06-local-upstream-$SUFFIX"
CADDY="site-mapper-s06-local-caddy-$SUFFIX"
CADDY_DATA="site-mapper-s06-local-caddy-data-$SUFFIX"
CADDY_CONFIG="site-mapper-s06-local-caddy-config-$SUFFIX"

cd "$ROOT_DIR"
mkdir -p "$RUNTIME"
rm -f "$RECEIPT"

cleanup() {
  docker rm -f "$CADDY" "$UPSTREAM" >/dev/null 2>&1 || true
  docker volume rm -f "$CADDY_DATA" "$CADDY_CONFIG" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

fail() {
  echo "S06_LOCAL_FAIL: $1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker CLI required"
docker info >/dev/null 2>&1 || fail "Docker daemon unavailable"
command -v python3 >/dev/null 2>&1 || fail "python3 required"

echo "Sprint 06 LOCAL-ONLY. No DNS, firewall, systemd install, Cloudflare, FIELD or TFARM04 changes."

echo "=== 1/7 STATIC + COMPOSE CONTRACTS ==="
python3 scripts/ci/check-s06.py
python3 -m py_compile infra/field/ops/*.py scripts/ci/check-s06.py
sh -n infra/field/ops/field-lan-service.sh
python3 -m json.tool infra/field/ops/network-policy.example.json >/dev/null
CLOUDFLARE_TUNNEL_TOKEN=local-syntax-only-not-a-real-token \
  docker compose -f docker-compose.field-lan.yml config --quiet
CLOUDFLARE_TUNNEL_TOKEN=local-syntax-only-not-a-real-token \
  docker compose -f docker-compose.lab-remote.yml config --quiet

FIELD_SERVICES="$(CLOUDFLARE_TUNNEL_TOKEN=x docker compose -f docker-compose.field-lan.yml config --services)"
LAB_SERVICES="$(CLOUDFLARE_TUNNEL_TOKEN=x docker compose -f docker-compose.lab-remote.yml config --services)"
[ "$FIELD_SERVICES" = "caddy" ] || fail "FIELD overlay contains unexpected services: $FIELD_SERVICES"
[ "$LAB_SERVICES" = "cloudflared-site-mapper" ] || fail "LAB overlay contains unexpected services: $LAB_SERVICES"

echo "=== 2/7 NETWORK POLICY VALIDATED, NEVER APPLIED ==="
python3 - "$RUNTIME/network-policy.local.json" <<'PY'
import json
import sys
from pathlib import Path

source = json.loads(Path("infra/field/ops/network-policy.example.json").read_text())
source["web"]["source_cidr"] = "10.77.0.0/24"
source["management"]["source_cidr"] = "10.77.1.0/24"
Path(sys.argv[1]).write_text(json.dumps(source, indent=2) + "\n")
PY
POLICY_OUT="$(python3 infra/field/ops/check-network-policy.py "$RUNTIME/network-policy.local.json")"
echo "$POLICY_OUT"
echo "$POLICY_OUT" | grep -q '"policy": "VALIDATED_NOT_APPLIED"' ||
  fail "network policy did not remain validation-only"
echo "$POLICY_OUT" | grep -q '"firewall_changed": false' ||
  fail "network policy reported a firewall change"

echo "=== 3/7 REAL ISOLATED CADDY TLS + CA PERSISTENCE ==="
docker run -d --name "$UPSTREAM" --network none node:22-alpine \
  node -e 'require("http").createServer((req,res)=>{if(req.url==="/api/health"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({status:"ok",profile:"s06-local"}));return;}res.writeHead(404);res.end();}).listen(3000,"127.0.0.1")' \
  >/dev/null

docker volume create "$CADDY_DATA" >/dev/null
docker volume create "$CADDY_CONFIG" >/dev/null

docker run --rm \
  -v "$ROOT_DIR/infra/field/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.10.2-alpine caddy validate --config /etc/caddy/Caddyfile >/dev/null

docker run -d --name "$CADDY" \
  --network "container:$UPSTREAM" \
  --read-only \
  --security-opt no-new-privileges:true \
  -v "$ROOT_DIR/infra/field/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$CADDY_DATA:/data" \
  -v "$CADDY_CONFIG:/config" \
  caddy:2.10.2-alpine caddy run --config /etc/caddy/Caddyfile --adapter caddyfile \
  >/dev/null

i=0
until docker exec "$CADDY" test -s /data/caddy/pki/authorities/local/root.crt >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 60 ] || {
    docker logs "$CADDY" >&2 || true
    fail "Caddy local CA was not created"
  }
  sleep 1
done

docker cp "$CADDY:/data/caddy/pki/authorities/local/root.crt" "$RUNTIME/caddy-root-before.crt" >/dev/null
CA_BEFORE="$(sha256sum "$RUNTIME/caddy-root-before.crt" | awk '{print $1}')"

cat > "$RUNTIME/tls-probe.py" <<'PY'
import socket
import ssl

host = "sitemapper.thradex.home.arpa"
ctx = ssl.create_default_context(cafile="/ca/root.crt")
with socket.create_connection(("127.0.0.1", 443), timeout=5) as raw:
    with ctx.wrap_socket(raw, server_hostname=host) as tls:
        cert = tls.getpeercert()
        sans = {value for kind, value in cert.get("subjectAltName", []) if kind == "DNS"}
        assert host in sans, (host, sans)
        tls.sendall(
            (
                "GET /api/health HTTP/1.1\r\n"
                f"Host: {host}\r\n"
                "Connection: close\r\n\r\n"
            ).encode()
        )
        response = b""
        while True:
            chunk = tls.recv(65536)
            if not chunk:
                break
            response += chunk
        assert b" 200 " in response.split(b"\r\n", 1)[0], response[:200]
        assert b'"profile":"s06-local"' in response, response[-500:]

try:
    socket.create_connection(("127.0.0.1", 80), timeout=1)
except OSError:
    pass
else:
    raise AssertionError("port 80 unexpectedly accepts connections")
print("S06_TLS_PROBE_PASS")
PY

docker run --rm -i \
  --network "container:$UPSTREAM" \
  -v "$RUNTIME/caddy-root-before.crt:/ca/root.crt:ro" \
  -v "$RUNTIME/tls-probe.py:/probe.py:ro" \
  python:3.13-alpine python /probe.py

[ -z "$(docker port "$UPSTREAM" 2>/dev/null)" ] || fail "mock upstream published a host port"
[ -z "$(docker port "$CADDY" 2>/dev/null)" ] || fail "Caddy published a host port"

docker restart "$CADDY" >/dev/null
i=0
until docker exec "$CADDY" test -s /data/caddy/pki/authorities/local/root.crt >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 30 ] || fail "Caddy CA unavailable after restart"
  sleep 1
done
docker cp "$CADDY:/data/caddy/pki/authorities/local/root.crt" "$RUNTIME/caddy-root-after.crt" >/dev/null
CA_AFTER="$(sha256sum "$RUNTIME/caddy-root-after.crt" | awk '{print $1}')"
[ "$CA_BEFORE" = "$CA_AFTER" ] || fail "Caddy CA identity changed across restart"

docker run --rm -i \
  --network "container:$UPSTREAM" \
  -v "$RUNTIME/caddy-root-after.crt:/ca/root.crt:ro" \
  -v "$RUNTIME/tls-probe.py:/probe.py:ro" \
  python:3.13-alpine python /probe.py

echo "S06_CADDY_TLS_PASS caSha256=$CA_AFTER"

echo "=== 4/7 WATCHDOG SELECTIVE RECOVERY CONTRACT ==="
python3 - <<'PY'
import importlib.util
import subprocess
from pathlib import Path

path = Path("infra/field/ops/watchdog.py")
spec = importlib.util.spec_from_file_location("s06_watchdog", path)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

assert {"mongodb", "timescaledb", "telemetry-store", "mongo-init"} <= mod.PROTECTED
assert mod.RECOVERABLE == {"site-mapper", "caddy"}
assert mod.restart("mongodb") is False
assert mod.restart("timescaledb") is False

calls = []
mod.container_for = lambda service: "fake-site-mapper" if service == "site-mapper" else None

def fake_run(*args, **kwargs):
    calls.append(args)
    if args[:3] == ("docker", "inspect", "--format"):
        return subprocess.CompletedProcess(args, 0, "running\n", "")
    if args[:2] == ("docker", "restart"):
        return subprocess.CompletedProcess(args, 0, "", "")
    return subprocess.CompletedProcess(args, 1, "", "unexpected")

mod.run = fake_run
assert mod.restart("site-mapper") is True
restart_calls = [x for x in calls if x[:2] == ("docker", "restart")]
assert restart_calls == [
    ("docker", "restart", "--time", "10", "fake-site-mapper")
], restart_calls
assert all("mongodb" not in " ".join(x) and "timescaledb" not in " ".join(x) for x in restart_calls)
print("S06_WATCHDOG_SELECTIVE_RECOVERY_PASS")
PY

echo "=== 5/7 BACKUP FAIL-CLOSED + RESTORE GUARDS ==="
set +e
S06_AGE_RECIPIENT='' python3 infra/field/ops/backup.py >"$RUNTIME/backup-negative.out" 2>&1
BACKUP_RC=$?
set -e
[ "$BACKUP_RC" -ne 0 ] || fail "S06 backup unexpectedly ran without an approved age recipient"
grep -q 'S06_AGE_RECIPIENT' "$RUNTIME/backup-negative.out" ||
  fail "S06 backup did not fail for the expected recipient guard"

FAKE_BUNDLE="$RUNTIME/fake-encrypted-bundle"
rm -rf "$FAKE_BUNDLE"
mkdir -p "$FAKE_BUNDLE"
printf 'ciphertext-placeholder\n' > "$FAKE_BUNDLE/mongo.archive.gz.age"
FAKE_SHA="$(sha256sum "$FAKE_BUNDLE/mongo.archive.gz.age" | awk '{print $1}')"
python3 - "$FAKE_BUNDLE/manifest.json" "$FAKE_SHA" <<'PY'
import json
import sys
from pathlib import Path
Path(sys.argv[1]).write_text(json.dumps({
    "schema": 1,
    "encryption": "age",
    "files": {
        "mongo.archive.gz.age": {
            "sha256": sys.argv[2],
            "bytes": 23
        }
    }
}, indent=2) + "\n")
PY

FORBIDDEN="$RUNTIME/forbidden-restore"
rm -rf "$FORBIDDEN"
set +e
python3 infra/field/ops/restore-preflight.py \
  --bundle "$FAKE_BUNDLE" \
  --isolated-output "$FORBIDDEN" \
  --identity /dev/null >"$RUNTIME/restore-negative.out" 2>&1
RESTORE_RC=$?
set -e
[ "$RESTORE_RC" -ne 0 ] || fail "restore preflight allowed output inside repository"
grep -q 'choose an isolated output outside the working repository' "$RUNTIME/restore-negative.out" ||
  fail "restore preflight did not enforce repository isolation"

touch "$FAKE_BUNDLE/INCOMPLETE"
OUTSIDE="/tmp/site-mapper-s06-incomplete-$SUFFIX"
rm -rf "$OUTSIDE"
set +e
python3 infra/field/ops/restore-preflight.py \
  --bundle "$FAKE_BUNDLE" \
  --isolated-output "$OUTSIDE" \
  --identity /dev/null >"$RUNTIME/incomplete-negative.out" 2>&1
INCOMPLETE_RC=$?
set -e
rm -rf "$OUTSIDE"
[ "$INCOMPLETE_RC" -ne 0 ] || fail "restore preflight accepted an INCOMPLETE bundle"
grep -q 'incomplete backup: refusing restore' "$RUNTIME/incomplete-negative.out" ||
  fail "restore preflight did not reject INCOMPLETE bundle"

echo "S06_BACKUP_RESTORE_GUARDS_PASS"

echo "=== 6/7 REVERIFY REAL S00 ISOLATED ENGINE RESTORE ==="
[ -s "$S00_RECEIPT" ] || fail "S00 acceptance receipt missing; real local backup/restore evidence unavailable"
grep -q '^status=ACCEPTED_LOCAL$' "$S00_RECEIPT" ||
  fail "S00 local acceptance receipt is not accepted"
grep -q '^fieldTouched=false$' "$S00_RECEIPT" ||
  fail "S00 receipt does not prove FIELD untouched"
[ -d "$S00_BACKUP" ] || fail "S00 backup artifact directory missing"
sh scripts/operations/verify-isolated-backup-restore.sh "$S00_BACKUP"

echo "=== 7/7 ISSUE S06 LOCAL ENGINEERING RECEIPT ==="
SHA="$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
cat > "$RECEIPT" <<EOF
status=S06_LOCAL_ENGINEERING_ACCEPTED_FIELD_PENDING
acceptedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$SHA
caddyTls=PASS
caddyCaPersistence=PASS
hostPublishedPorts=0
networkPolicy=VALIDATED_NOT_APPLIED
watchdogSelectiveRecovery=PASS
backupFailClosed=PASS
restoreGuards=PASS
s00RealIsolatedRestore=PASS
encryptedOffHostBackupExecution=FIELD_PENDING
lanClientDnsTrust=FIELD_PENDING
firewallIngress=FIELD_PENDING
hostRebootRecovery=FIELD_PENDING
cloudflareAccess=FIELD_PENDING
applyAllowed=false
fieldTouched=false
EOF
chmod 600 "$RECEIPT"

echo "S06_LOCAL_ENGINEERING_ACCEPTED_FIELD_PENDING"
echo "receipt=$RECEIPT"
echo "APPLY_ALLOWED=false"
echo "TFARM04_TOUCHED=false"
