#!/usr/bin/env bash
# Local WSL2/Linux Config4 lab. Does not overwrite .env or delete volumes.
set -euo pipefail

usage() {
  cat <<'HELP'
bash scripts/lab/bfdb-snmp-config4.sh init       ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh up         ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh bootstrap  ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh collectors ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh status     ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh down       ../bfdb-telemetry-gateway
HELP
}
[[ $# -eq 2 ]] || { usage; exit 2; }
ACTION="$1"
BFDB="$2"
SITE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ -d "$BFDB" ]] || { echo "BFDB path not found: $BFDB" >&2; exit 2; }
BFDB="$(cd "$BFDB" && pwd)"
[[ -f "$BFDB/docker-compose.snmp.yml" && -f "$BFDB/docker-compose.yml" ]] || {
  echo 'Expected thradexIT/bfdb-telemetry-gateway checkout.' >&2
  exit 2
}
command -v docker >/dev/null || { echo 'Docker CLI required.' >&2; exit 2; }
NETWORK=site_mapper_bfdb_snmp_lab
BRIDGE="$SITE/infra/lab/bfdb-snmp"

bfdb_compose() {
  docker compose --project-directory "$BFDB" -p bfdb_snmp_lab \
    --env-file "$BFDB/.env" --env-file "$BFDB/.env.snmp" \
    -f "$BFDB/docker-compose.yml" -f "$BFDB/docker-compose.snmp.yml" \
    -f "$BRIDGE/config4-bfdb.override.yml" --profile snmp "$@"
}
site_compose() {
  docker compose --project-directory "$SITE" -p site_mapper_snmp_lab \
    --env-file "$SITE/.env" --env-file "$BFDB/.env.snmp" \
    -f "$SITE/docker-compose.telemetry.yml" \
    -f "$BRIDGE/config4-site-mapper.override.yml" --profile snmp "$@"
}
check_env() {
  for path in "$SITE/.env" "$BFDB/.env" "$BFDB/.env.snmp"; do
    [[ -f "$path" ]] || { echo "Missing $path; run init first." >&2; exit 2; }
  done
  grep -q '^APP_ENV=development$' "$SITE/.env" || {
    echo 'APP_ENV=development required for this local, insecure laboratory.' >&2
    exit 2
  }
  grep -q '^SNMP_EMULATOR_PROFILE=ELTEK_BDCBB_CONFIG_4$' "$BFDB/.env.snmp" || {
    echo 'Set SNMP_EMULATOR_PROFILE=ELTEK_BDCBB_CONFIG_4 in BFDB .env.snmp.' >&2
    exit 2
  }
}

case "$ACTION" in
  init)
    command -v openssl >/dev/null || { echo 'OpenSSL required.' >&2; exit 2; }
    if [[ ! -f "$SITE/.env" ]]; then
      umask 077
      cat > "$SITE/.env" <<EOF
APP_ENV=development
APP_PERSISTENCE=mongodb
MONGODB_DB_NAME=site_mapper_snmp_lab
BOOTSTRAP_ADMIN_TOKEN=$(openssl rand -hex 32)
TELEMETRY_ENABLED=true
MQTT_BROKER_URL=mqtt://mosquitto:1883
MQTT_TOPIC_PREFIX=data/dev/
MQTT_TOPIC_FILTER=data/dev/#
TELEMETRY_HISTORY_ENABLED=true
TIMESCALE_DB_PASSWORD=$(openssl rand -hex 32)
TELEMETRY_STORE_TOKEN=$(openssl rand -hex 32)
MODBUS_BRIDGE_TOKEN=$(openssl rand -hex 32)
MODBUS_SOURCE_UNITS_JSON='{"EMU-BFDB-01":1,"EMU-BFDB-02":2,"EMU-BFDB-03":3}'
MODBUS_POINT_LAYOUT=panels-4x24
SNMP_INGEST_TOKEN=$(openssl rand -hex 32)
EOF
      echo 'Created private Site Mapper .env (secrets not printed).'
    else
      echo 'Preserved existing Site Mapper .env; verify required variables yourself.'
    fi
    if [[ ! -f "$BFDB/.env" ]]; then
      umask 077
      cat > "$BFDB/.env" <<EOF
DB_NAME=bfdb
DB_USER=bfdb
DB_PASSWORD=$(openssl rand -hex 24)
MQTT_HOST=mosquitto
MQTT_PORT=1883
EOF
      echo 'Created private BFDB .env.'
    else
      echo 'Preserved existing BFDB .env.'
    fi
    if [[ ! -f "$BFDB/.env.snmp" ]]; then
      umask 077
      cat > "$BFDB/.env.snmp" <<EOF
SNMP_V3_USERNAME=lab_readonly
SNMP_V3_AUTH_KEY=$(openssl rand -hex 24)
SNMP_V3_PRIV_KEY=$(openssl rand -hex 24)
SNMP_EMULATOR_PROFILE=ELTEK_BDCBB_CONFIG_4
SNMP_EMULATOR_SCENARIO=NORMAL
SNMP_AGENT_UPDATE_MS=1000
EOF
      echo 'Created private BFDB .env.snmp (Config4).'
    else
      echo 'Preserved existing BFDB .env.snmp; manually select Config4 if needed.'
    fi
    ;;
  up)
    check_env
    docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
    bfdb_compose config --quiet
    site_compose config --quiet
    bfdb_compose up -d --build mosquitto timescaledb telemetry-gateway field-emulator \
      snmp-agent-bfdb-01 snmp-agent-bfdb-02 snmp-agent-bfdb-03
    site_compose up -d --build mongodb mongo-init timescaledb telemetry-store \
      modbus-tcp site-mapper operational-console
    echo 'Site Mapper: http://127.0.0.1:3000/login'
    echo 'Console: http://127.0.0.1:3100'
    echo 'SNMP UDP agents: 127.0.0.1:11611, :11612, :11613'
    echo 'Bootstrap a new admin if required, then commission A1/A2/B1/B2 before collectors.'
    ;;
  bootstrap)
    check_env
    read -r -p 'Superadmin email: ' account_email
    read -r -p 'Display name: ' account_name
    read -rs -p 'Password (minimum 12 characters): ' account_password
    echo
    [[ ${#account_password} -ge 12 ]] || { echo 'Password too short.' >&2; exit 2; }
    printf '%s\n%s\n%s\n' "$account_email" "$account_password" "$account_name" | \
      site_compose exec -T site-mapper node -e '
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => data += chunk);
        process.stdin.on("end", async () => {
          const [email, password, displayName] = data.trimEnd().split("\n");
          const response = await fetch("http://127.0.0.1:3000/api/auth/bootstrap", {
            method: "POST",
            headers: {
              authorization: "Bearer " + process.env.BOOTSTRAP_ADMIN_TOKEN,
              "content-type": "application/json"
            },
            body: JSON.stringify({ email, password, displayName })
          });
          const result = await response.json();
          if (!response.ok) {
            console.error("Bootstrap:", response.status, result.error ?? "failed");
            process.exitCode = 1;
          } else console.log("Created Superadmin:", result.user?.email);
        }).on("error", () => { process.exitCode = 1; });
      '
    unset account_password
    ;;
  collectors)
    check_env
    site_compose up -d --build snmp-collector snmp-collector-02 snmp-collector-03
    echo 'Collectors started. Without commissioned AccessPort/OID bindings, HTTP 422 is expected.'
    site_compose ps snmp-collector snmp-collector-02 snmp-collector-03
    ;;
  status)
    check_env
    echo '=== BFDB ==='
    bfdb_compose ps
    echo '=== Site Mapper ==='
    site_compose ps
    echo '=== HTTP health (not an SNMP/Timescale acceptance proof) ==='
    curl -fsS http://127.0.0.1:3000/api/health || true
    echo
    ;;
  down)
    check_env
    site_compose down
    bfdb_compose down
    echo 'Stopped both stacks without deleting volumes.'
    ;;
  *) usage; exit 2 ;;
esac
