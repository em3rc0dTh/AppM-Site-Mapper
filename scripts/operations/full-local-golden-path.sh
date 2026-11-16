#!/bin/sh
# AppM Site Mapper MK1 — FINAL FULL LOCAL GOLDEN PATH.
# Re-runs the accepted S00-S06 local gates on the same committed HEAD.
# Never deploys, applies FIELD evidence, touches TFARM04, or uses developer/customer volumes.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
RUNTIME="$ROOT_DIR/.runtime/full-local-golden"
RECEIPT="$RUNTIME/FULL-LOCAL-GOLDEN-PATH.txt"
LOG_DIR="$RUNTIME/logs"
PRIVATE_MANIFEST="$ROOT_DIR/.runtime/s05-commissioning-reference.json"
PRIVATE_MANIFEST_SHA="02500a269c2593d3b40842d45b80adb00502f3adfe16f56af855b317144374e4"

cd "$ROOT_DIR"
mkdir -p "$LOG_DIR"
rm -f "$RECEIPT"

fail() {
  echo "FULL_LOCAL_GOLDEN_FAIL: $1" >&2
  exit 1
}

run_gate() {
  name="$1"
  shift
  log="$LOG_DIR/$name.log"
  echo
  echo "================================================================"
  echo "GOLDEN_STAGE=$name"
  echo "================================================================"
  set +e
  "$@" 2>&1 | tee "$log"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || fail "$name failed rc=$rc log=$log"
}

expect_line() {
  file="$1"
  expected="$2"
  [ -s "$file" ] || fail "missing receipt: $file"
  grep -Fqx "$expected" "$file" ||
    fail "receipt contract mismatch: $file expected '$expected'"
}

echo "MK1 FINAL FULL LOCAL GOLDEN PATH"
echo "No OFFICE, FIELD, TFARM04, DNS, firewall, Cloudflare or production APPLY."

command -v docker >/dev/null 2>&1 || fail "Docker CLI required"
docker info >/dev/null 2>&1 || fail "Docker daemon unavailable"
command -v git >/dev/null 2>&1 || fail "git required"

BRANCH="$(git branch --show-current)"
HEAD="$(git rev-parse HEAD)"
ORIGIN_MAIN="$(git rev-parse origin/main 2>/dev/null || true)"
[ "$BRANCH" = "main" ] || fail "golden path must run from main; current=$BRANCH"
[ -n "$ORIGIN_MAIN" ] || fail "origin/main unavailable; fetch/pull main first"
[ "$HEAD" = "$ORIGIN_MAIN" ] ||
  fail "local main is not exactly origin/main: local=$HEAD origin=$ORIGIN_MAIN"

STATUS="$(git status --porcelain --untracked-files=normal)"
[ -z "$STATUS" ] || {
  echo "$STATUS" >&2
  fail "working tree must be clean before final certification"
}

[ -s "$PRIVATE_MANIFEST" ] || fail "S05 private manifest missing"
printf '%s  %s\n' "$PRIVATE_MANIFEST_SHA" "$PRIVATE_MANIFEST" |
  sha256sum -c - >/dev/null ||
  fail "S05 private manifest hash changed"

echo "GOLDEN_HEAD=$HEAD"
echo "S05_PRIVATE_MANIFEST_SHA256=$PRIVATE_MANIFEST_SHA"

run_gate s00 sh scripts/operations/sprint-00-local-gate.sh
expect_line "$ROOT_DIR/.runtime/s00-local/SPRINT-00-ACCEPTANCE.txt" "status=ACCEPTED_LOCAL"
expect_line "$ROOT_DIR/.runtime/s00-local/SPRINT-00-ACCEPTANCE.txt" "gitSha=$HEAD"
expect_line "$ROOT_DIR/.runtime/s00-local/SPRINT-00-ACCEPTANCE.txt" "fieldTouched=false"

run_gate s01 sh scripts/operations/sprint-01-gate.sh
expect_line "$ROOT_DIR/.runtime/s01-local/SPRINT-01-MONGO-ACCEPTANCE.txt" "status=LOCAL_MONGO_PASS"
expect_line "$ROOT_DIR/.runtime/s01-local/SPRINT-01-MONGO-ACCEPTANCE.txt" "gitSha=$HEAD"
expect_line "$ROOT_DIR/.runtime/s01-local/SPRINT-01-MONGO-ACCEPTANCE.txt" "fieldTouched=false"

run_gate s02 sh scripts/operations/sprint-02-local-gate.sh
expect_line "$ROOT_DIR/.runtime/s02-local/SPRINT-02-ALARM-ACCEPTANCE.txt" "status=S02_LOCAL_ACCEPTANCE_PASS"
expect_line "$ROOT_DIR/.runtime/s02-local/SPRINT-02-ALARM-ACCEPTANCE.txt" "gitSha=$HEAD"
expect_line "$ROOT_DIR/.runtime/s02-local/SPRINT-02-ALARM-ACCEPTANCE.txt" "fieldTouched=false"

run_gate s03_s04 sh scripts/operations/sprint-03-04-local-browser-gate.sh
expect_line "$ROOT_DIR/.runtime/s03-s04-local/SPRINT-03-04-BROWSER-ACCEPTANCE.txt" "status=S03_S04_LOCAL_ACCEPTANCE_PASS"
expect_line "$ROOT_DIR/.runtime/s03-s04-local/SPRINT-03-04-BROWSER-ACCEPTANCE.txt" "gitSha=$HEAD"
expect_line "$ROOT_DIR/.runtime/s03-s04-local/SPRINT-03-04-BROWSER-ACCEPTANCE.txt" "fieldTouched=false"

run_gate s05_a sh scripts/operations/sprint-05-local-gate.sh
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-LOCAL-ACCEPTANCE.txt" "status=S05_PRIVATE_MANIFEST_VALID_RUNTIME_DIFF_REQUIRED"
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-LOCAL-ACCEPTANCE.txt" "gitSha=$HEAD"
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-LOCAL-ACCEPTANCE.txt" "applyAllowed=false"
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-LOCAL-ACCEPTANCE.txt" "fieldTouched=false"

run_gate s05_b sh scripts/operations/sprint-05-runtime-diff.sh
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-RUNTIME-DIFF-ACCEPTANCE.txt" "status=S05_LOCAL_ACCEPTED_WITH_KNOWN_FIELD_CONFLICTS"
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-RUNTIME-DIFF-ACCEPTANCE.txt" "gitSha=$HEAD"
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-RUNTIME-DIFF-ACCEPTANCE.txt" "meterSerialConflicts=3"
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-RUNTIME-DIFF-ACCEPTANCE.txt" "gatewayNetworkPending=9"
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-RUNTIME-DIFF-ACCEPTANCE.txt" "applyAllowed=false"
expect_line "$ROOT_DIR/.runtime/s05-local/SPRINT-05-RUNTIME-DIFF-ACCEPTANCE.txt" "fieldTouched=false"

run_gate s06 sh scripts/operations/sprint-06-local-gate.sh
expect_line "$ROOT_DIR/.runtime/s06-local/SPRINT-06-LOCAL-ACCEPTANCE.txt" "status=S06_LOCAL_ENGINEERING_ACCEPTED_FIELD_PENDING"
expect_line "$ROOT_DIR/.runtime/s06-local/SPRINT-06-LOCAL-ACCEPTANCE.txt" "gitSha=$HEAD"
expect_line "$ROOT_DIR/.runtime/s06-local/SPRINT-06-LOCAL-ACCEPTANCE.txt" "s00RealIsolatedRestore=PASS"
expect_line "$ROOT_DIR/.runtime/s06-local/SPRINT-06-LOCAL-ACCEPTANCE.txt" "applyAllowed=false"
expect_line "$ROOT_DIR/.runtime/s06-local/SPRINT-06-LOCAL-ACCEPTANCE.txt" "fieldTouched=false"

cat > "$RECEIPT" <<EOF
status=FULL_LOCAL_GOLDEN_PATH_PASS
acceptedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gitSha=$HEAD
branch=main
originMain=$ORIGIN_MAIN
workingTree=CLEAN
s00=PASS
s01=PASS
s02=PASS
s03=PASS
s04=PASS
s05=PASS_WITH_3_KNOWN_FIELD_SERIAL_CONFLICTS
s05GatewayNetworkPending=9
s06=LOCAL_ENGINEERING_PASS_FIELD_PENDING
privateManifestSha256=$PRIVATE_MANIFEST_SHA
applyAllowed=false
fieldTouched=false
tfarm04Touched=false
fieldCertificationRequired=true
EOF
chmod 600 "$RECEIPT"

echo
echo "FULL_LOCAL_GOLDEN_PATH_PASS"
echo "gitSha=$HEAD"
echo "receipt=$RECEIPT"
echo "S00_S06_ALL_LOCAL_GATES=PASS"
echo "S05_KNOWN_FIELD_SERIAL_CONFLICTS=3"
echo "S06_FIELD_CERTIFICATION=PENDING"
echo "APPLY_ALLOWED=false"
echo "TFARM04_TOUCHED=false"
