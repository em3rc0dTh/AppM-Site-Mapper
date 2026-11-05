#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.runtime/office-test.env"
MODE="${1:-plan}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing OFFICE runtime env: $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"
set -- docker compose --env-file "$ENV_FILE" -f docker-compose.telemetry.yml -f docker-compose.office-test.yml

migration_plan() {
  "$@" exec -T mongodb mongosh --quiet seed-01     < scripts/migrations/seed-01-v8-qdf2-breakers.mongosh.js
}

migration_apply() {
  "$@" exec -T     -e SITEMAPPER_SEED01_V8_QDF2_MODE=apply     -e SITEMAPPER_SEED01_V8_QDF2_ACK=APPLY     mongodb mongosh --quiet seed-01     < scripts/migrations/seed-01-v8-qdf2-breakers.mongosh.js
}

case "$MODE" in
  plan)
    echo "=== SPRINT 00 PLAN / NO DATABASE WRITES ==="
    sh scripts/operations/validate-s00-code.sh
    echo "=== QDF-2 MIGRATION PLAN ==="
    migration_plan
    echo "=== TIMESCALE / HISTORY HEALTH ==="
    sh infra/field/repair-timescale-role.sh check
    echo "=== CURRENT BASELINE AUDIT ==="
    if sh scripts/operations/audit-office-baseline.sh; then
      echo "S00_PLAN_CURRENT_BASELINE_ALREADY_ACCEPTABLE"
    else
      echo "S00_PLAN_BASELINE_NOT_YET_ACCEPTED"
      echo "Review the failure above. If it is only the planned QDF-2 v8 delta, run accept after review."
    fi
    echo "S00_PLAN_COMPLETE"
    ;;
  accept)
    if [ "${SITEMAPPER_S00_ACK:-}" != "ACCEPT" ]; then
      echo "Set SITEMAPPER_S00_ACK=ACCEPT to execute the Sprint 00 acceptance gate." >&2
      exit 2
    fi

    echo "=== 1/6 CODE VALIDATION ==="
    sh scripts/operations/validate-s00-code.sh

    echo "=== 2/6 BACKUP ==="
    BACKUP_OUTPUT="$(sh scripts/operations/backup-office-state.sh)"
    printf '%s\n' "$BACKUP_OUTPUT"
    BACKUP_DIR="$(printf '%s\n' "$BACKUP_OUTPUT" | sed -n 's/^OFFICE_BACKUP_OK //p' | tail -1)"
    [ -n "$BACKUP_DIR" ] || { echo "Could not identify backup directory" >&2; exit 3; }

    echo "=== 3/6 ISOLATED RESTORE VERIFICATION ==="
    sh scripts/operations/verify-office-backup-restore.sh "$BACKUP_DIR"

    echo "=== 4/6 QDF-2 V8 RECONCILIATION ==="
    migration_apply

    echo "=== 5/6 TIMESCALE / HISTORY HEALTH ==="
    sh infra/field/repair-timescale-role.sh check

    echo "=== 6/6 FINAL OFFICE BASELINE ==="
    sh scripts/operations/audit-office-baseline.sh

    GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    RECEIPT="$BACKUP_DIR/SPRINT-00-ACCEPTANCE.txt"
    {
      echo "status=ACCEPTED"
      echo "acceptedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "gitSha=$GIT_SHA"
      echo "backupDir=$BACKUP_DIR"
      echo "profile=OFFICE_FIELD"
      echo "breakerTotal=74"
      echo "qdf2Breakers=26"
      echo "qdf4Breakers=12"
      echo "qdf5Breakers=36"
      echo "mqttBindingMode=AUTOMATIC_RUNTIME_RECONCILIATION"
      echo "snmpProfile=CONFIG2_THREE_SOURCE"
    } > "$RECEIPT"
    chmod 600 "$RECEIPT"

    echo "SPRINT_00_ACCEPTED"
    echo "receipt=$RECEIPT"
    ;;
  *)
    echo "Usage: $0 [plan|accept]" >&2
    exit 64
    ;;
esac
