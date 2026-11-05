#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
TEMPLATE="$ROOT_DIR/infra/field/office-test.env.example"
RUNTIME_DIR="$ROOT_DIR/.runtime"
ENV_FILE="$RUNTIME_DIR/office-test.env"

mkdir -p "$RUNTIME_DIR"
umask 077

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate OFFICE runtime secrets." >&2
  exit 1
fi

rand_hex() {
  openssl rand -hex "$1"
}

ensure_credential_key() {
  file="$1"
  if grep -Eq '^SITE_MAPPER_CREDENTIAL_KEY=[0-9a-fA-F]{64}$' "$file"; then
    chmod 600 "$file"
    echo "OFFICE runtime env already exists and has a credential encryption key: $file"
    return 0
  fi

  credential_key="$(rand_hex 32)"
  python3 - "$file" "$credential_key" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
value = sys.argv[2]
lines = path.read_text().splitlines()
updated = False
result = []
for line in lines:
    if line.startswith("SITE_MAPPER_CREDENTIAL_KEY="):
        result.append(f"SITE_MAPPER_CREDENTIAL_KEY={value}")
        updated = True
    else:
        result.append(line)
if not updated:
    result.append(f"SITE_MAPPER_CREDENTIAL_KEY={value}")
path.write_text("\n".join(result) + "\n")
PY
  chmod 600 "$file"
  echo "Updated existing OFFICE runtime env with a missing credential encryption key: $file"
}

if [ -f "$ENV_FILE" ]; then
  ensure_credential_key "$ENV_FILE"
  exit 0
fi

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
echo "MQTT password: generated in the private runtime env (not printed)"
echo "MQTT default topic: office/dev/#"
echo "Edit MQTT_TOPIC_PREFIX and MQTT_TOPIC_FILTER before startup if today's publisher uses another topic."
