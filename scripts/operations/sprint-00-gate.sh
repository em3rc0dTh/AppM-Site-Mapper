#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"

echo "Sprint 00 acceptance is LOCAL-ONLY."
echo "TFARM/OFFICE/FIELD environments are not valid test targets for this gate."

exec sh "$ROOT_DIR/scripts/operations/sprint-00-local-gate.sh"
