#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.runtime/office-test.env"
IMAGE="appm-site-mapper:s00-validation"

cd "$ROOT_DIR"

echo "=== S00 CODE VALIDATION ==="
docker build --target build -t "$IMAGE" -f infra/site-mapper/Dockerfile .

echo "=== AUTO-BINDING ACCEPTANCE TEST ==="
docker run --rm "$IMAGE"   npm exec vitest -- run tests/integration/telemetry-service.test.ts   -t "auto-reconciles BFDB metrics only after the matching breaker exists in Site Mapper"

echo "=== FULL TELEMETRY SERVICE INTEGRATION ==="
docker run --rm "$IMAGE"   npm exec vitest -- run tests/integration/telemetry-service.test.ts

if [ -f "$ENV_FILE" ]; then
  echo "=== OFFICE COMPOSE VALIDATION ==="
  docker compose     --env-file "$ENV_FILE"     -f docker-compose.telemetry.yml     -f docker-compose.office-test.yml     --profile snmp     config >/dev/null
else
  echo "OFFICE compose runtime validation skipped: $ENV_FILE not present."
fi

echo "S00_CODE_VALIDATION_PASS"
