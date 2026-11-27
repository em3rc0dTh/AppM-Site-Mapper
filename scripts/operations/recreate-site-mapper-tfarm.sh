#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${TFARM_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
PROJECT="${TFARM_COMPOSE_PROJECT:-appm-site-mapper}"
RUNTIME_ENV="${TFARM_RUNTIME_ENV:-$ROOT/.runtime/office-test.env}"

fail() { echo "TFARM_SITE_MAPPER_ERROR: $*" >&2; exit 1; }
log() { printf '\n=== %s ===\n' "$*"; }

[[ "$(id -u)" -eq 0 ]] || fail "root is required"
[[ -f "$RUNTIME_ENV" ]] || fail "runtime environment missing: $RUNTIME_ENV"

compose=(
  docker compose
  --project-name "$PROJECT"
  --env-file "$RUNTIME_ENV"
  -f "$ROOT/docker-compose.telemetry.yml"
  -f "$ROOT/docker-compose.office-test.yml"
  -f "$ROOT/docker-compose.snmp-field.yml"
  -f "$ROOT/deployment/compose.tfarm.yml"
  --profile snmp
)

log "Validate canonical TFARM Site Mapper model"
"${compose[@]}" config --format json |
  python3 -c '
import json, sys
model = json.load(sys.stdin)
services = model.get("services", {})
app = services.get("site-mapper")
if not isinstance(app, dict):
    raise SystemExit("site-mapper service missing from canonical compose model")
env = app.get("environment", {})
if not isinstance(env, dict):
    raise SystemExit("site-mapper environment missing")
sources_raw = env.get("INDUSTRIAL_INGEST_SOURCES_JSON")
profiles_raw = env.get("INDUSTRIAL_PROFILES_JSON")
if not sources_raw or not profiles_raw:
    raise SystemExit("industrial source/profile configuration missing")
sources = json.loads(sources_raw)
profiles = json.loads(profiles_raw)
if not isinstance(sources, dict) or not sources:
    raise SystemExit("industrial source credentials mapping invalid")
if not isinstance(profiles, list) or not profiles:
    raise SystemExit("industrial profiles mapping invalid")
profile_sources = {row.get("sourceIdentity") for row in profiles if isinstance(row, dict)}
if not profile_sources or not profile_sources.issubset(set(sources)):
    raise SystemExit("industrial profile/source mapping inconsistent")
' || fail "canonical Compose industrial contract is invalid"

log "Recreate Site Mapper only"
"${compose[@]}" up -d \
  --no-deps \
  --no-build \
  --pull never \
  --force-recreate \
  site-mapper

log "Wait for application"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS --max-time 5 http://127.0.0.1:3000/api/health >/dev/null ||
  fail "Site Mapper did not become healthy"

log "Certify industrial ingest authentication"
probe_code="$(curl -sS -o /tmp/tfarm-site-mapper-ingest-probe.json -w '%{http_code}' \
  --max-time 10 -X POST http://127.0.0.1:3000/api/telemetry/industrial/ingest \
  -H 'Authorization: Bearer definitely-invalid-probe-token' \
  -H 'Content-Type: application/json' --data '{}')" ||
  fail "industrial ingest probe failed"
rm -f /tmp/tfarm-site-mapper-ingest-probe.json
[[ "$probe_code" == "401" ]] ||
  fail "industrial ingest contract failed (expected HTTP 401, got $probe_code)"

echo "TFARM_SITE_MAPPER_RECREATE_OK project=$PROJECT industrial_ingest=401"
