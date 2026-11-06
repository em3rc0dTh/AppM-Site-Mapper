#!/bin/sh
# Sprint 05 FULL LOCAL acceptance.
# Phase A always validates code/security/observability contracts.
# Phase B requires the private local commissioning reference and performs a read-only runtime diff.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
IMAGE="appm-site-mapper:s05-validation"
RUNTIME="$ROOT_DIR/.runtime/s05-local"
PRIVATE_MANIFEST="$ROOT_DIR/.runtime/s05-commissioning-reference.json"
PUBLIC_MANIFEST="$ROOT_DIR/config/industrial/s05-commissioning-reference.example.json"
RECEIPT="$RUNTIME/SPRINT-05-LOCAL-ACCEPTANCE.txt"

cd "$ROOT_DIR"
mkdir -p "$RUNTIME"
rm -f "$RECEIPT"

fail() {
  printf '\nS05_LOCAL_FAIL: %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker CLI is required"
docker info >/dev/null 2>&1 || fail "Docker daemon unavailable"

echo "Sprint 05 LOCAL-ONLY. No APPLY, OFFICE, FIELD or TFARM04 mutation is allowed."

echo "=== 1/6 BUILD NODE 22 TEST IMAGE ==="
docker build --target test -t "$IMAGE" -f infra/site-mapper/Dockerfile . ||
  fail "Could not build S05 validation image"

echo "=== 2/6 S05 COMMISSIONING / OBSERVABILITY / CREDENTIAL TESTS ==="
docker run --rm --network none "$IMAGE" sh -ec '
  node node_modules/vitest/vitest.mjs run \
    tests/unit/commissioning-observability.test.ts \
    tests/unit/industrial-commissioning-idempotency.test.ts \
    tests/unit/industrial-credential-security.test.ts \
    tests/unit/s05-snmp-history-diagnostics.test.ts \
    tests/unit/s05-office-secret-wiring.test.ts
' || fail "S05 commissioning/security/observability tests failed"

echo "=== 3/6 I18N + TYPESCRIPT + FORMAT ==="
docker run --rm --network none "$IMAGE" sh -ec '
  node node_modules/vitest/vitest.mjs run \
    tests/unit/i18n-catalogs.test.ts \
    tests/unit/i18n-static-ui.test.ts
  npm run typecheck
  npx prettier --check \
    src/app/api/industrial/commissioning/route.ts \
    src/components/industrial/commissioning-console.tsx \
    src/components/industrial/commissioning-observability.tsx \
    src/modules/industrial/application/commissioning-observability.ts \
    src/modules/telemetry/infrastructure/http-telemetry-store.ts \
    scripts/operations/audit-s05-commissioning.mjs \
    config/industrial/s05-commissioning-reference.example.json \
    docker-compose.telemetry.yml \
    tests/unit/commissioning-observability.test.ts \
    tests/unit/industrial-commissioning-idempotency.test.ts \
    tests/unit/industrial-credential-security.test.ts \
    tests/unit/s05-snmp-history-diagnostics.test.ts \
    tests/unit/s05-office-secret-wiring.test.ts
' || fail "S05 i18n/typecheck/format contract failed"

echo "=== 4/6 PUBLIC AUDITOR SCHEMA VALIDATION ==="
docker run --rm --network none \
  -v "$PUBLIC_MANIFEST:/tmp/s05-public-reference.json:ro" \
  "$IMAGE" node scripts/operations/audit-s05-commissioning.mjs \
  --manifest /tmp/s05-public-reference.json --manifest-only ||
  fail "S05 public commissioning manifest schema validation failed"

echo "=== 5/6 PRIVATE MANIFEST PREFLIGHT ==="
if [ ! -s "$PRIVATE_MANIFEST" ]; then
  cat > "$RECEIPT" <<EOF
status=S05_LOCAL_CODE_PASS_RUNTIME_DIFF_PENDING
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$(git rev-parse HEAD 2>/dev/null || echo UNAVAILABLE)
privateManifestPresent=false
runtimeDiff=PENDING_PRIVATE_MANIFEST
applyAllowed=false
fieldTouched=false
EOF
  chmod 600 "$RECEIPT"
  echo "S05_LOCAL_CODE_PASS_RUNTIME_DIFF_PENDING"
  echo "reason=private manifest missing: $PRIVATE_MANIFEST"
  echo "receipt=$RECEIPT"
  echo "APPLY_ALLOWED=false"
  echo "TFARM04_TOUCHED=false"
  exit 20
fi

docker run --rm --network none \
  -v "$PRIVATE_MANIFEST:/tmp/s05-private-reference.json:ro" \
  "$IMAGE" node scripts/operations/audit-s05-commissioning.mjs \
  --manifest /tmp/s05-private-reference.json --manifest-only ||
  fail "Private S05 commissioning manifest is invalid"

echo "=== 6/6 RUNTIME DIFF CONTRACT ==="
cat > "$RECEIPT" <<EOF
status=S05_PRIVATE_MANIFEST_VALID_RUNTIME_DIFF_REQUIRED
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$(git rev-parse HEAD 2>/dev/null || echo UNAVAILABLE)
privateManifestPresent=true
runtimeDiff=REQUIRED_AGAINST_LOCAL_VALIDATION_RUNTIME
applyAllowed=false
fieldTouched=false
EOF
chmod 600 "$RECEIPT"

echo "S05_PRIVATE_MANIFEST_VALID_RUNTIME_DIFF_REQUIRED"
echo "receipt=$RECEIPT"
echo "next=run read-only audit against the isolated local validation MongoDB"
echo "APPLY_ALLOWED=false"
echo "TFARM04_TOUCHED=false"
