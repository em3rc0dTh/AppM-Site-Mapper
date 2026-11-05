#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
TEMPLATE="$ROOT_DIR/infra/field/office-test.env.example"
RUNTIME_DIR="$ROOT_DIR/.runtime"
ENV_FILE="$RUNTIME_DIR/office-test.env"

mkdir -p "$RUNTIME_DIR"
umask 077

if [ -f "$ENV_FILE" ]; then
  echo "OFFICE runtime env already exists: $ENV_FILE"
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate OFFICE runtime secrets." >&2
  exit 1
fi

rand_hex() {
  openssl rand -hex "$1"
}

TIMESCALE_DB_PASSWORD="$(rand_hex 18)"
BOOTSTRAP_ADMIN_TOKEN="$(rand_hex 24)"
TELEMETRY_STORE_TOKEN="$(rand_hex 24)"
MODBUS_BRIDGE_TOKEN="$(rand_hex 24)"
SNMP_INGEST_TOKEN="$(rand_hex 24)"
SITE_MAPPER_CREDENTIAL_KEY="$(rand_hex 32)"
MQTT_PASSWORD="$(rand_hex 18)"

cp "$TEMPLATE" "$ENV_FILE"

python3 - "$ENV_FILE"   "$TIMESCALE_DB_PASSWORD"   "$BOOTSTRAP_ADMIN_TOKEN"   "$TELEMETRY_STORE_TOKEN"   "$MODBUS_BRIDGE_TOKEN"   "$SNMP_INGEST_TOKEN"   "$SITE_MAPPER_CREDENTIAL_KEY"   "$MQTT_PASSWORD" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
values = iter(sys.argv[2:])
keys = [
    "TIMESCALE_DB_PASSWORD",
    "BOOTSTRAP_ADMIN_TOKEN",
    "TELEMETRY_STORE_TOKEN",
    "MODBUS_BRIDGE_TOKEN",
    "SNMP_INGEST_TOKEN",
    "SITE_MAPPER_CREDENTIAL_KEY",
    "MQTT_PASSWORD",
]
replacements = dict(zip(keys, values))
lines = []
for line in path.read_text().splitlines():
    key = line.split("=", 1)[0]
    if key in replacements:
        line = f"{key}={replacements[key]}"
    lines.append(line)
path.write_text("\n".join(lines) + "\n")
PY

chmod 600 "$ENV_FILE"

echo "Created $ENV_FILE"
echo "MQTT username: site-mapper-office"
echo "MQTT password: $MQTT_PASSWORD"
echo "MQTT default topic: office/dev/#"
echo "Edit MQTT_TOPIC_PREFIX and MQTT_TOPIC_FILTER before startup if today's publisher uses another topic."
