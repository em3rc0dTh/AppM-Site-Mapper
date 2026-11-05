#!/bin/sh
# Sprint 01 local MongoDB acceptance gate.
# No customer stacks, host Mongo ports, named volumes, or field services.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
IMAGE="appm-site-mapper:s01-validation"
MONGO_NAME="site-mapper-s01-mongo-$$"
MONGO_ID=""
RUNTIME="$ROOT_DIR/.runtime/s01-local"
RECEIPT="$RUNTIME/SPRINT-01-MONGO-ACCEPTANCE.txt"

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
  printf '\nS01_LOCAL_MONGO_FAIL: %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker CLI is required"
docker info >/dev/null 2>&1 || fail "Docker daemon unavailable"
test -f tests/integration/breaker-limits-mongo.test.ts || fail "Required real-MongoDB tests missing"
test -f infra/site-mapper/Dockerfile || fail "Site Mapper Dockerfile missing"

echo "Sprint 01 LOCAL-ONLY. No TFARM, OFFICE, or FIELD targets."
echo "MongoDB is disposable, has no published ports and no persistent volumes."
echo "=== 1/6 BUILD NODE 22 / NEXT.JS VALIDATION IMAGE ==="
docker build --target build -t "$IMAGE" -f infra/site-mapper/Dockerfile . ||
  fail "Docker build / Next.js build failed"

echo "=== 2/6 STATIC QUALITY / BREAKER UNIT TESTS ==="
docker run --rm --network none "$IMAGE" sh -ec '
  npm run typecheck
  npm run lint
  npm run format:check
  node node_modules/vitest/vitest.mjs run tests/unit/breaker-limit-service.test.ts tests/unit/breaker-protection.test.ts
' || fail "S01 static checks or breaker unit tests failed"

echo "=== 3/6 START ISOLATED MONGODB REPLICA SET ==="
MONGO_ID="$(docker run -d --rm \
  --name "$MONGO_NAME" \
  --network bridge \
  --tmpfs /data/db:rw,size=536870912 \
  mongo:7.0 \
  mongod --replSet s01local --bind_ip_all --port 27017 \
  --setParameter diagnosticDataCollectionEnabled=false)" ||
  fail "Could not start disposable MongoDB"
test -n "$MONGO_ID" || fail "Missing MongoDB container ID"

i=0
until docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | grep -qx 1; do
  i=$((i + 1))
  if [ "$i" -ge 90 ]; then
    docker logs --tail 60 "$MONGO_ID" >&2 || true
    fail "MongoDB did not accept local connections"
  fi
  sleep 1
done

docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'rs.initiate({_id:"s01local",members:[{_id:0,host:"127.0.0.1:27017"}]}).ok' |
  grep -qx 1 || fail "Replica set initiation failed"

i=0
until docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'db.adminCommand({hello:1}).isWritablePrimary === true ? "READY" : "WAIT"' \
  2>/dev/null | grep -qx READY; do
  i=$((i + 1))
  if [ "$i" -ge 90 ]; then
    docker logs --tail 60 "$MONGO_ID" >&2 || true
    fail "Replica set did not elect a primary"
  fi
  sleep 1
done

echo "=== 4/6 REAL MONGODB TRANSACTION ACCEPTANCE (MANDATORY) ==="
# Share the ephemeral MongoDB network namespace. The URI below can only reach
# this loopback instance; no host port is published or customer URI inherited.
docker run --rm --network "container:$MONGO_ID" \
  -e NODE_ENV=test \
  -e APP_ENV=test \
  -e APP_PERSISTENCE=mongodb \
  -e MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=s01local' \
  -e MONGODB_DB_NAME=site_mapper_s01_gate \
  -e CI_BREAKER_ACCEPTANCE=true \
  "$IMAGE" node node_modules/vitest/vitest.mjs run \
  tests/integration/breaker-limits-mongo.test.ts ||
  fail "S01 MongoDB transaction tests failed (rollback/concurrency/audit required)"

echo "=== 5/6 CHECK MONGODB CONTAINER IS ALIVE ==="
docker exec "$MONGO_ID" mongosh --quiet --host 127.0.0.1 \
  --eval 'db.adminCommand({hello:1}).isWritablePrimary === true ? "READY" : "FAIL"' |
  grep -qx READY || fail "Replica set became unhealthy"

echo "=== 6/6 ISSUE LOCAL MONGO RECEIPT ==="
# The receipt is deliberately scoped to automated acceptance. Human browser
# validation and GitHub Actions status remain independent release gates.
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo UNAVAILABLE)"
cat > "$RECEIPT" <<EOF
status=LOCAL_MONGO_PASS
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$GIT_SHA
testFile=tests/integration/breaker-limits-mongo.test.ts
mongoImage=mongo:7.0
replicaSet=s01local
mongoPublishedPorts=0
externalDatabaseUsed=false
fieldTouched=false
uiAcceptance=PENDING
githubActionsAcceptance=PENDING
EOF
chmod 600 "$RECEIPT"
echo "S01_LOCAL_MONGO_PASS"
echo "receipt=$RECEIPT"
echo "TFARM04_TOUCHED=false"
