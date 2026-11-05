#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
IMAGE="appm-site-mapper:s00-validation"

cd "$ROOT_DIR"

echo "=== S00 CODE VALIDATION ==="
docker build --target build -t "$IMAGE" -f infra/site-mapper/Dockerfile .

echo "=== AUTO-BINDING ACCEPTANCE TEST ==="
docker run --rm "$IMAGE" \
  npm exec vitest -- run tests/integration/telemetry-service.test.ts \
  -t "auto-reconciles BFDB metrics only after the matching breaker exists in Site Mapper"

echo "=== FULL TELEMETRY SERVICE INTEGRATION ==="
docker run --rm "$IMAGE" \
  npm exec vitest -- run tests/integration/telemetry-service.test.ts

echo "=== LOCAL INTEGRATION COMPOSE CONTRACT ==="
docker compose \
  --env-file infra/integration/integration.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.integration.yml \
  config >/dev/null

echo "=== CONFIG2 FIELD COMPOSE CONTRACT (CONFIG ONLY, NO START) ==="
docker compose \
  --env-file infra/field/office-test.env.example \
  -f docker-compose.telemetry.yml \
  -f docker-compose.office-test.yml \
  --profile snmp \
  config >/dev/null

echo "S00_CODE_VALIDATION_PASS"
