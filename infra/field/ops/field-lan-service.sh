#!/bin/sh
# Operator-installed systemd entrypoint. Controls ONLY the Caddy service.
set -eu
: "${S06_REPO_ROOT:?Set absolute checkout path}"
: "${S06_COMPOSE_PROJECT:?Set existing Compose project name}"
: "${S06_RUNTIME_ENV:?Set existing private runtime environment path}"
[ -f "$S06_RUNTIME_ENV" ] || { echo "Existing runtime env not found; refusing to regenerate" >&2; exit 1; }
[ -f "$S06_REPO_ROOT/docker-compose.telemetry.yml" ] || exit 1
[ -f "$S06_REPO_ROOT/docker-compose.office-test.yml" ] || exit 1
[ -f "$S06_REPO_ROOT/docker-compose.field-lan.yml" ] || exit 1
cd "$S06_REPO_ROOT"
action="${1:-}"
set -- docker compose \
  -p "$S06_COMPOSE_PROJECT" --env-file "$S06_RUNTIME_ENV" \
  -f docker-compose.telemetry.yml \
  -f docker-compose.office-test.yml \
  -f docker-compose.field-lan.yml \
  --profile field-lan
case "$action" in
  start)
    "$@" config --quiet
    # Existing DB/telemetry containers are NEVER recreated by this command.
    "$@" up -d --no-deps --no-build --pull never caddy
    ;;
  stop)
    "$@" stop caddy
    ;;
  *)
    echo "Usage: field-lan-service.sh start|stop" >&2
    exit 2
    ;;
esac
