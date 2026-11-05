#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.runtime/office-test.env"
MODE="${1:-check}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing OFFICE runtime env: $ENV_FILE" >&2
  exit 1
fi

TIMESCALE_DB_PASSWORD="$(grep '^TIMESCALE_DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
if [ -z "$TIMESCALE_DB_PASSWORD" ]; then
  echo "TIMESCALE_DB_PASSWORD is empty" >&2
  exit 1
fi

cd "$ROOT_DIR"
set -- docker compose --env-file "$ENV_FILE" -f docker-compose.telemetry.yml -f docker-compose.office-test.yml

check_store() {
  curl -fsS http://127.0.0.1:18081/health >/dev/null 2>&1
}

case "$MODE" in
  check)
    if "$@" exec -T timescaledb pg_isready -U site_mapper -d site_mapper_telemetry >/dev/null 2>&1; then
      echo "TIMESCALE_CONTAINER_READY"
    else
      echo "TIMESCALE_CONTAINER_NOT_READY" >&2
      exit 2
    fi
    if check_store; then
      echo "TELEMETRY_STORE_HEALTHY"
      exit 0
    fi
    echo "TELEMETRY_STORE_UNHEALTHY"
    exit 3
    ;;
  apply)
    if [ "${SITEMAPPER_TIMESCALE_REPAIR_ACK:-}" != "APPLY" ]; then
      echo "Set SITEMAPPER_TIMESCALE_REPAIR_ACK=APPLY to synchronize the persisted DB role password." >&2
      exit 4
    fi

    # psql :'password' performs SQL-literal quoting; the secret is not printed.
    "$@" exec -T timescaledb       psql -X -q -v ON_ERROR_STOP=1 -v password="$TIMESCALE_DB_PASSWORD"       -U site_mapper -d site_mapper_telemetry       -c "ALTER ROLE site_mapper WITH PASSWORD :'password';"

    # Only the history adapter needs a restart after role-password synchronization.
    "$@" restart telemetry-store >/dev/null

    i=0
    while [ "$i" -lt 30 ]; do
      if check_store; then
        echo "TIMESCALE_ROLE_SYNCHRONIZED"
        echo "TELEMETRY_STORE_HEALTHY"
        exit 0
      fi
      i=$((i + 1))
      sleep 1
    done
    echo "Role synchronized but telemetry-store health did not recover." >&2
    exit 5
    ;;
  *)
    echo "Usage: $0 [check|apply]" >&2
    exit 64
    ;;
esac
