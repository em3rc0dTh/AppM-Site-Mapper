#!/usr/bin/env bash
set -u

# Read-only preflight for the Site Mapper client VM baseline.
# It does not install, delete, resize, mount, restart or reconfigure anything.

MIN_VCPU="${SITE_MAPPER_VM_MIN_VCPU:-4}"
MIN_RAM_GIB="${SITE_MAPPER_VM_MIN_RAM_GIB:-16}"
MIN_ROOT_GIB="${SITE_MAPPER_VM_MIN_ROOT_GIB:-180}"
WARN_PCT="${SITE_MAPPER_STORAGE_WARN_PCT:-70}"
ACTION_PCT="${SITE_MAPPER_STORAGE_ACTION_PCT:-80}"
CRITICAL_PCT="${SITE_MAPPER_STORAGE_CRITICAL_PCT:-90}"

failures=0
warnings=0

pass() { printf 'PASS  %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL  %s\n' "$*"; failures=$((failures + 1)); }
info() { printf 'INFO  %s\n' "$*"; }

arch="$(uname -m 2>/dev/null || printf unknown)"
case "$arch" in
  x86_64|amd64) pass "architecture=$arch" ;;
  *) fail "architecture=$arch; client baseline requires x86_64/amd64" ;;
esac

if command -v nproc >/dev/null 2>&1; then
  vcpu="$(nproc)"
  if [ "$vcpu" -ge "$MIN_VCPU" ]; then
    pass "vCPU=$vcpu (required >= $MIN_VCPU)"
  else
    fail "vCPU=$vcpu (required >= $MIN_VCPU)"
  fi
else
  fail "nproc not available; cannot verify CPU capacity"
fi

if [ -r /proc/meminfo ]; then
  mem_kib="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  mem_gib=$((mem_kib / 1024 / 1024))
  # A VM configured with 16 GiB may expose slightly less usable RAM to Linux.
  if [ "$mem_gib" -ge $((MIN_RAM_GIB - 1)) ]; then
    pass "RAM≈${mem_gib} GiB usable (requested VM baseline: ${MIN_RAM_GIB} GB)"
  else
    fail "RAM≈${mem_gib} GiB usable (requested VM baseline: ${MIN_RAM_GIB} GB)"
  fi
else
  fail "/proc/meminfo not readable; cannot verify RAM"
fi

df_line="$(df -Pk / 2>/dev/null | awk 'NR==2 {print $2, $5}')"
if [ -n "$df_line" ]; then
  root_kib="$(printf '%s\n' "$df_line" | awk '{print $1}')"
  root_pct_raw="$(printf '%s\n' "$df_line" | awk '{print $2}')"
  root_pct="${root_pct_raw%%%}"
  root_gib=$((root_kib / 1024 / 1024))

  if [ "$root_gib" -ge "$MIN_ROOT_GIB" ]; then
    pass "root filesystem≈${root_gib} GiB usable (200 GB nominal VM disk target)"
  else
    fail "root filesystem≈${root_gib} GiB usable; expected roughly >= ${MIN_ROOT_GIB} GiB for a 200 GB nominal disk"
  fi

  if [ "$root_pct" -ge 95 ]; then
    fail "root usage=${root_pct}% EMERGENCY; capacity recovery required"
  elif [ "$root_pct" -ge "$CRITICAL_PCT" ]; then
    fail "root usage=${root_pct}% CRITICAL; intervene immediately"
  elif [ "$root_pct" -ge "$ACTION_PCT" ]; then
    warn "root usage=${root_pct}% ACTION; expand storage or execute approved retention/archive plan"
  elif [ "$root_pct" -ge "$WARN_PCT" ]; then
    warn "root usage=${root_pct}% WARNING; review growth trend"
  else
    pass "root usage=${root_pct}% (< ${WARN_PCT}%)"
  fi
else
  fail "cannot read root filesystem capacity"
fi

if command -v docker >/dev/null 2>&1; then
  if docker version >/dev/null 2>&1; then
    pass "Docker Engine available"
  else
    warn "docker command exists but daemon is not accessible by current operator"
  fi

  if docker compose version >/dev/null 2>&1; then
    pass "Docker Compose plugin available"
  else
    fail "Docker Compose plugin unavailable"
  fi
else
  fail "Docker Engine not installed"
fi

if command -v timedatectl >/dev/null 2>&1; then
  ntp="$(timedatectl show -p NTPSynchronized --value 2>/dev/null || true)"
  if [ "$ntp" = "yes" ]; then
    pass "NTP synchronized"
  elif [ -n "$ntp" ]; then
    warn "NTP synchronization reports: $ntp"
  fi
fi

if command -v docker >/dev/null 2>&1; then
  docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  [ -n "$docker_root" ] && info "Docker root: $docker_root"
fi

info "Storage policy: warning=${WARN_PCT}% action=${ACTION_PCT}% critical=${CRITICAL_PCT}% emergency=95%"
info "At 80%, no automatic deletion is authorized. Expand or execute the approved retention/archive plan."

if [ "$failures" -gt 0 ]; then
  printf '\nRESULT FAIL (%d failure(s), %d warning(s))\n' "$failures" "$warnings"
  exit 1
fi

if [ "$warnings" -gt 0 ]; then
  printf '\nRESULT PASS_WITH_WARNINGS (%d warning(s))\n' "$warnings"
  exit 0
fi

printf '\nRESULT PASS\n'
