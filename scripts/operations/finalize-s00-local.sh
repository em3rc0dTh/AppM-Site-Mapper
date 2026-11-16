#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
BACKUP="${1:-$ROOT_DIR/.runtime/s00-local/backup}"
RUNTIME="$ROOT_DIR/.runtime/s00-local"

cd "$ROOT_DIR"

if [ ! -d "$BACKUP" ]; then
  echo "Sprint 00 backup not found: $BACKUP" >&2
  echo "Run the full local gate first." >&2
  exit 1
fi

echo "=== S00 FINALIZE 7/8: ISOLATED RESTORE ==="
sh scripts/operations/verify-isolated-backup-restore.sh "$BACKUP"

echo "=== S00 FINALIZE 8/8: ACCEPTANCE RECEIPT ==="
mkdir -p "$RUNTIME"
SHA="$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
cat > "$RUNTIME/SPRINT-00-ACCEPTANCE.txt" <<EOF
status=ACCEPTED_LOCAL
acceptedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$SHA
project=site-mapper-s00-local
seedVersion=8
breakers=74
fieldTouched=false
acceptanceBasis=steps-1-through-6-passed-and-backup-created;isolated-restore-verified
EOF
chmod 600 "$RUNTIME/SPRINT-00-ACCEPTANCE.txt"

echo "SPRINT_00_ACCEPTED_LOCAL"
echo "receipt=$RUNTIME/SPRINT-00-ACCEPTANCE.txt"
echo "TFARM04_TOUCHED=false"
