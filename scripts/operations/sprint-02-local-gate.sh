#!/bin/sh
# Sprint 02 local alarm acceptance gate.
# Disposable MongoDB only; no host ports, persistent volumes, OFFICE, FIELD or TFARM targets.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
IMAGE="appm-site-mapper:s02-validation"
MONGO_NAME="site-mapper-s02-mongo-$$"
MONGO_ID=""
RUNTIME="$ROOT_DIR/.runtime/s02-local"
RECEIPT="$RUNTIME/SPRINT-02-ALARM-ACCEPTANCE.txt"

cd "$ROOT_DIR"
mkdir -p "$RUNTIME"
rm -f "$RECEIPT"

cleanup() {
  if [ -n "$MONGO_ID" ]; then
    docker rm -f "$MONGO_ID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() {
  printf '\nS02_LOCAL_FAIL: %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker CLI is required"
docker info >/dev/null 2>&1 || fail "Docker daemon unavailable"
for file in \
  tests/unit/sprint02-alarm-history.test.ts \
  tests/unit/alarm-redteam.test.ts \
  tests/integration/s02-alarm-acceptance-mongo.test.ts \
  tests/integration/alarm-redteam-mongo.test.ts
do
  test -f "$file" || fail "Required S02 test missing: $file"
done

echo "Sprint 02 LOCAL-ONLY. No TFARM, OFFICE, FIELD targets or host Mongo ports."
echo "MongoDB is disposable, uses tmpfs and shares only its network namespace with test containers."

echo "=== 1/6 BUILD NODE 22 TEST IMAGE ==="
docker build --target test -t "$IMAGE" -f infra/site-mapper/Dockerfile . ||
  fail "Node 22 S02 test image build failed"

echo "=== 2/6 UNIT LIFECYCLE + RED TEAM + TYPESCRIPT ==="
docker run --rm --network none "$IMAGE" sh -ec '
  node node_modules/vitest/vitest.mjs run \
    tests/unit/sprint02-alarm-history.test.ts \
    tests/unit/alarm-redteam.test.ts
  npm run typecheck
' || fail "S02 unit lifecycle/red-team or TypeScript failed"

echo "=== 3/6 START ISOLATED MONGODB REPLICA SET ==="
MONGO_ID="$(docker run -d --rm \
  --name "$MONGO_NAME" \
  --network bridge \
  --tmpfs /data/db:rw,size=536870912 \
  mongo:7.0 \
  mongod --replSet rs0 --bind_ip_all --port 27017 \
  --setParameter diagnosticDataCollectionEnabled=false)" ||
  fail "Could not start disposable S02 MongoDB"
test -n "$MONGO_ID" || fail "Missing S02 MongoDB container ID"

i=0
until docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | grep -qx 1; do
  i=$((i + 1))
  if [ "$i" -ge 90 ]; then
    docker logs --tail 60 "$MONGO_ID" >&2 || true
    fail "S02 MongoDB did not accept loopback connections"
  fi
  sleep 1
done

docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]}).ok' |
  grep -qx 1 || fail "S02 replica set initiation failed"

i=0
until docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'db.adminCommand({hello:1}).isWritablePrimary === true ? "READY" : "WAIT"' \
  2>/dev/null | grep -qx READY; do
  i=$((i + 1))
  if [ "$i" -ge 90 ]; then
    docker logs --tail 60 "$MONGO_ID" >&2 || true
    fail "S02 replica set did not elect a primary"
  fi
  sleep 1
done

echo "=== 4/6 REAL MONGO ELECTRICAL LIFECYCLE + 500+ HISTORY ==="
docker run --rm --network "container:$MONGO_ID" \
  -e APP_ENV=test \
  -e CI_ALARM_ACCEPTANCE=true \
  -e MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
  "$IMAGE" node node_modules/vitest/vitest.mjs run \
  tests/integration/s02-alarm-acceptance-mongo.test.ts ||
  fail "S02 real-Mongo alarm lifecycle/history acceptance failed"

echo "=== 5/6 REAL MONGO CONCURRENCY RED TEAM ==="
docker run --rm --network "container:$MONGO_ID" \
  -e APP_ENV=test \
  -e ALARM_REDTEAM_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
  "$IMAGE" node node_modules/vitest/vitest.mjs run \
  tests/integration/alarm-redteam-mongo.test.ts ||
  fail "S02 real-Mongo concurrency red-team failed"

echo "=== 6/6 HEALTH + ACCEPTANCE RECEIPT ==="
docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'db.adminCommand({hello:1}).isWritablePrimary === true ? "READY" : "FAIL"' |
  grep -qx READY || fail "S02 replica set became unhealthy"

GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo UNAVAILABLE)"
cat > "$RECEIPT" <<EOF
status=S02_LOCAL_ACCEPTANCE_PASS
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$GIT_SHA
mongoImage=mongo:7.0
replicaSet=rs0
mongoPublishedPorts=0
mongoStorage=tmpfs
externalDatabaseUsed=false
fieldTouched=false
lifecycleAcceptance=PASS
historyPagination500Plus=PASS
concurrencyRedTeam=PASS
EOF
chmod 600 "$RECEIPT"

echo "S02_LOCAL_ACCEPTANCE_PASS"
echo "receipt=$RECEIPT"
echo "TFARM04_TOUCHED=false"
