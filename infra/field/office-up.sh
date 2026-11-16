#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.runtime/office-test.env"
SNMP_MODE="${1:-sim}"

if [ ! -f "$ENV_FILE" ]; then
  sh "$ROOT_DIR/infra/field/init-office-env.sh"
fi

case "$SNMP_MODE" in
  sim)
    PROFILE="snmp-sim"
    ;;
  real)
    PROFILE="snmp"
    ;;
  none)
    PROFILE=""
    ;;
  *)
    echo "Usage: $0 [sim|real|none]" >&2
    exit 2
    ;;
esac

cd "$ROOT_DIR"

set -- docker compose   --env-file "$ENV_FILE"   -f docker-compose.telemetry.yml   -f docker-compose.office-test.yml

if [ -n "$PROFILE" ]; then
  set -- "$@" --profile "$PROFILE"
fi

"$@" up -d --build

HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
MQTT_USER="$(grep '^MQTT_USERNAME=' "$ENV_FILE" | cut -d= -f2-)"
MQTT_TOPIC="$(grep '^MQTT_TOPIC_FILTER=' "$ENV_FILE" | cut -d= -f2-)"

echo
echo "OFFICE profile is up."
echo "SNMP mode: $SNMP_MODE"
echo "Ubuntu LAN IP: ${HOST_IP:-<check with hostname -I>}"
echo "MQTT port: 1883"
echo "MQTT username: $MQTT_USER"
echo "MQTT topic filter: $MQTT_TOPIC"
echo "Runtime credentials: $ENV_FILE"
echo
echo "If UFW is active, allow TCP/1883 from the trusted LAN before connecting another machine."
