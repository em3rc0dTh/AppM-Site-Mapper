#!/bin/sh
# Sprint 03 + Sprint 04 local browser acceptance.
# Disposable MongoDB and app share a private network namespace; no host ports,
# persistent volumes, OFFICE, FIELD or TFARM targets are used.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
RUNTIME="$ROOT_DIR/.runtime/s03-s04-local"
DOCKERFILE="$RUNTIME/Dockerfile.browser"
IMAGE="appm-site-mapper:s03-s04-browser"
MONGO_NAME="site-mapper-s03-s04-mongo-$$"
APP_NAME="site-mapper-s03-s04-app-$$"
BROWSER_NAME="site-mapper-s03-s04-browser-$$"
MONGO_ID=""
APP_ID=""
DB_NAME="site_mapper_http_ci_$(date -u +%s)"
RECEIPT="$RUNTIME/SPRINT-03-04-BROWSER-ACCEPTANCE.txt"
EVIDENCE="$RUNTIME/evidence"

cd "$ROOT_DIR"
mkdir -p "$RUNTIME" "$EVIDENCE"
rm -f "$RECEIPT"

cleanup() {
  docker rm -f "$BROWSER_NAME" >/dev/null 2>&1 || true
  if [ -n "$APP_ID" ]; then
    docker rm -f "$APP_ID" >/dev/null 2>&1 || true
  fi
  if [ -n "$MONGO_ID" ]; then
    docker rm -f "$MONGO_ID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() {
  printf '\nS03_S04_LOCAL_FAIL: %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker CLI is required"
docker info >/dev/null 2>&1 || fail "Docker daemon unavailable"

echo "Sprint 03 + 04 LOCAL-ONLY. No TFARM, OFFICE, FIELD targets or host ports."
echo "MongoDB and Next.js are disposable and isolated in a shared Docker network namespace."

cat > "$DOCKERFILE" <<'DOCKERFILE_EOF'
FROM node:22-bookworm AS node22
FROM mcr.microsoft.com/playwright:v1.56.1-noble
COPY --from=node22 /usr/local/ /usr/local/
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix /tmp/mk1-playwright --no-save --no-audit --no-fund playwright@1.56.1
COPY . .
DOCKERFILE_EOF

echo "=== 1/7 BUILD NODE 22 + CHROMIUM ACCEPTANCE IMAGE ==="
docker build -t "$IMAGE" -f "$DOCKERFILE" . ||
  fail "Could not build S03/S04 Chromium acceptance image"

echo "=== 2/7 S03 WORKSPACE UNIT CONSTRAINTS ==="
docker run --rm --network none "$IMAGE" \
  node node_modules/vitest/vitest.mjs run tests/unit/s03-resizable-workspace.test.ts ||
  fail "S03 workspace unit constraints failed"

echo "=== 3/7 START PRIVATE DISPOSABLE MONGODB ==="
MONGO_ID="$(docker run -d --rm \
  --name "$MONGO_NAME" \
  --network bridge \
  --tmpfs /data/db:rw,size=536870912 \
  mongo:7.0 \
  mongod --replSet rs0 --bind_ip_all --port 27017 \
  --setParameter diagnosticDataCollectionEnabled=false)" ||
  fail "Could not start disposable S03/S04 MongoDB"
test -n "$MONGO_ID" || fail "Missing S03/S04 MongoDB container ID"

i=0
until docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | grep -qx 1; do
  i=$((i + 1))
  [ "$i" -lt 90 ] || fail "S03/S04 MongoDB did not accept loopback connections"
  sleep 1
done

docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]}).ok' |
  grep -qx 1 || fail "S03/S04 replica set initiation failed"

i=0
until docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'db.adminCommand({hello:1}).isWritablePrimary === true ? "READY" : "WAIT"' \
  2>/dev/null | grep -qx READY; do
  i=$((i + 1))
  [ "$i" -lt 90 ] || fail "S03/S04 replica set did not elect a primary"
  sleep 1
done

echo "=== 4/7 START PRIVATE NEXT.JS APP ==="
APP_ID="$(docker run -d --rm \
  --name "$APP_NAME" \
  --network "container:$MONGO_ID" \
  -e APP_ENV=test \
  -e APP_PERSISTENCE=mongodb \
  -e MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
  -e MONGODB_DB_NAME="$DB_NAME" \
  -e BOOTSTRAP_ADMIN_TOKEN='s03-s04-local-bootstrap-only' \
  -e TELEMETRY_ENABLED=false \
  -e TELEMETRY_HISTORY_ENABLED=false \
  -e TELEMETRY_STORE_URL='http://127.0.0.1:65535' \
  -e TELEMETRY_STORE_TOKEN='s03-s04-local-store-only' \
  -e SNMP_INGEST_TOKEN='s03-s04-local-snmp-only' \
  -e MODBUS_BRIDGE_URL='http://127.0.0.1:65534' \
  -e MODBUS_BRIDGE_TOKEN='s03-s04-local-modbus-only' \
  -e MODBUS_SOURCE_UNITS_JSON='{}' \
  "$IMAGE" npm run dev -- -H 127.0.0.1 -p 3100)" ||
  fail "Could not start disposable Next.js app"
test -n "$APP_ID" || fail "Missing S03/S04 app container ID"

i=0
until docker exec "$APP_ID" node -e \
  "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
  >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 120 ]; then
    docker logs --tail 100 "$APP_ID" >&2 || true
    fail "S03/S04 Next.js app did not become healthy"
  fi
  sleep 1
done

echo "=== 5/7 CREATE DISPOSABLE OPERATIONAL FIXTURES VIA REAL HTTP ==="
docker run --rm --network "container:$MONGO_ID" \
  -e APP_ENV=test \
  -e APP_PERSISTENCE=mongodb \
  -e MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
  -e MONGODB_DB_NAME="$DB_NAME" \
  -e BOOTSTRAP_ADMIN_TOKEN='s03-s04-local-bootstrap-only' \
  -e CI_HTTP_ACCEPTANCE=true \
  -e CI_COMBINED_E2E=false \
  -e CI_HTTP_BASE_URL='http://127.0.0.1:3100' \
  "$IMAGE" node scripts/ci/http-operational-journey.mjs ||
  fail "Could not create S03/S04 browser fixtures through real HTTP"

echo "=== 6/7 REAL CHROMIUM S03 + S04 ACCEPTANCE ==="
docker rm -f "$BROWSER_NAME" >/dev/null 2>&1 || true
set +e
docker run --name "$BROWSER_NAME" --network "container:$MONGO_ID" \
  -e APP_ENV=test \
  -e MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
  -e MONGODB_DB_NAME="$DB_NAME" \
  -e CI_COMBINED_E2E=true \
  -e CI_HTTP_BASE_URL='http://127.0.0.1:3100' \
  "$IMAGE" node scripts/ci/browser-operational-journey.mjs
BROWSER_RC=$?
set -e

for file in \
  mk1-operational-browser.png \
  mk1-operational-browser-1920.png \
  mk1-operational-browser-1366.png \
  mk1-operational-browser-1063.png \
  mk1-operational-browser-992.png \
  mk1-operational-breaker-1063.png \
  mk1-operational-breaker-992.png \
  mk1-operational-room-1366.png
do
  docker cp "$BROWSER_NAME:/tmp/$file" "$EVIDENCE/$file" >/dev/null 2>&1 || true
done

[ "$BROWSER_RC" -eq 0 ] || {
  docker logs --tail 100 "$APP_ID" >&2 || true
  fail "Real Chromium S03/S04 acceptance failed"
}

echo "=== 7/7 ISSUE LOCAL ACCEPTANCE RECEIPT ==="
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo UNAVAILABLE)"
SCREENSHOT_COUNT="$(find "$EVIDENCE" -maxdepth 1 -type f -name 'mk1-operational-*.png' | wc -l | tr -d ' ')"
[ "$SCREENSHOT_COUNT" -ge 4 ] || fail "Expected Chromium evidence screenshots were not preserved"

cat > "$RECEIPT" <<EOF
status=S03_S04_LOCAL_ACCEPTANCE_PASS
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$GIT_SHA
database=$DB_NAME
mongoPublishedPorts=0
appPublishedPorts=0
externalDatabaseUsed=false
fieldTouched=false
s03WorkspaceUnit=PASS
s03ChromiumResponsive=PASS
s04ThradexBranding=PASS
s04OperationalAttribution=PASS
browserEvidenceCount=$SCREENSHOT_COUNT
EOF
chmod 600 "$RECEIPT"

echo "S03_S04_LOCAL_ACCEPTANCE_PASS"
echo "receipt=$RECEIPT"
echo "evidence=$EVIDENCE"
echo "TFARM04_TOUCHED=false"
