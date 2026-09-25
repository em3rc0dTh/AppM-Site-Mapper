#!/usr/bin/env bash
set -euo pipefail

IMAGE="${MOSQUITTO_IMAGE:-eclipse-mosquitto:2.1.2-alpine}"
NETWORK="g16-mqtt-$$"
BROKER="g16-mosquitto-$$"
TMP_DIR="$(mktemp -d)"
DEVICE_PASSWORD="$(openssl rand -hex 24)"
INGESTOR_PASSWORD="$(openssl rand -hex 24)"

cleanup() {
  docker rm -f "$BROKER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/config" "$TMP_DIR/certs" "$TMP_DIR/data"
cp infra/mosquitto/mosquitto.conf "$TMP_DIR/config/mosquitto.conf"
cp infra/mosquitto/acl "$TMP_DIR/config/acl"
chmod 0777 "$TMP_DIR/data"

if grep -Eq '^[[:space:]]*listener[[:space:]]+1883([[:space:]]|$)' "$TMP_DIR/config/mosquitto.conf"; then
  echo "Plaintext MQTT listener 1883 is forbidden." >&2
  exit 1
fi

openssl req -x509 -newkey rsa:2048 -sha256 -nodes   -keyout "$TMP_DIR/certs/ca.key"   -out "$TMP_DIR/certs/ca.crt"   -days 1   -subj '/CN=G16 Test CA' >/dev/null 2>&1

openssl req -newkey rsa:2048 -sha256 -nodes   -keyout "$TMP_DIR/certs/server.key"   -out "$TMP_DIR/certs/server.csr"   -subj "/CN=$BROKER" >/dev/null 2>&1

cat > "$TMP_DIR/certs/server.ext" <<EOF
subjectAltName=DNS:$BROKER
extendedKeyUsage=serverAuth
EOF

openssl x509 -req   -in "$TMP_DIR/certs/server.csr"   -CA "$TMP_DIR/certs/ca.crt"   -CAkey "$TMP_DIR/certs/ca.key"   -CAcreateserial   -out "$TMP_DIR/certs/server.crt"   -days 1   -sha256   -extfile "$TMP_DIR/certs/server.ext" >/dev/null 2>&1

chmod 0644 "$TMP_DIR/certs/ca.crt" "$TMP_DIR/certs/server.crt" "$TMP_DIR/certs/server.key"

docker run --rm   -v "$TMP_DIR/config:/mosquitto/config"   "$IMAGE"   mosquitto_passwd -b -c /mosquitto/config/passwd source-a "$DEVICE_PASSWORD" >/dev/null

docker run --rm   -v "$TMP_DIR/config:/mosquitto/config"   "$IMAGE"   mosquitto_passwd -b /mosquitto/config/passwd appmanager-ingestor "$INGESTOR_PASSWORD" >/dev/null

chmod 0644 "$TMP_DIR/config/passwd" "$TMP_DIR/config/acl"

docker network create "$NETWORK" >/dev/null

docker run -d   --name "$BROKER"   --network "$NETWORK"   -v "$TMP_DIR/config:/mosquitto/config:ro"   -v "$TMP_DIR/certs:/mosquitto/certs:ro"   -v "$TMP_DIR/data:/mosquitto/data"   "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if ! docker inspect -f '{{.State.Running}}' "$BROKER" 2>/dev/null | grep -qx true; then
    docker logs "$BROKER" >&2 || true
    exit 1
  fi

  if docker logs "$BROKER" 2>&1 | grep -q 'running'; then
    break
  fi

  sleep 1
done

if ! docker logs "$BROKER" 2>&1 | grep -q 'running'; then
  docker logs "$BROKER" >&2 || true
  echo "Broker did not become ready." >&2
  exit 1
fi

client() {
  docker run --rm     --network "$NETWORK"     -v "$TMP_DIR/certs:/certs:ro"     "$IMAGE"     "$@"
}

# Anonymous clients must not authenticate.
if client mosquitto_sub   -h "$BROKER" -p 8883 --cafile /certs/ca.crt   -t 'appmanager/v1/raw/+/telemetry' -C 1 -W 1 >/dev/null 2>&1; then
  echo "Anonymous MQTT access unexpectedly succeeded." >&2
  exit 1
fi

PAYLOAD='{"sn":"SERIAL-DEL-DISPOSITIVO","reported":{"metric_key":13.09}}'
RECEIVED="$TMP_DIR/received.txt"

client mosquitto_sub   -h "$BROKER" -p 8883 --cafile /certs/ca.crt   -u appmanager-ingestor -P "$INGESTOR_PASSWORD"   -t 'appmanager/v1/raw/source-a/telemetry'   -C 1 -W 10 >"$RECEIVED" &
SUB_PID=$!

sleep 1

client mosquitto_pub   -h "$BROKER" -p 8883 --cafile /certs/ca.crt   -u source-a -P "$DEVICE_PASSWORD"   -t 'appmanager/v1/raw/source-a/telemetry'   -m "$PAYLOAD" -q 1

wait "$SUB_PID"
grep -Fx "$PAYLOAD" "$RECEIVED" >/dev/null

# A source credential must not publish into another source namespace.
UNAUTHORIZED="$TMP_DIR/unauthorized.txt"
client mosquitto_sub   -h "$BROKER" -p 8883 --cafile /certs/ca.crt   -u appmanager-ingestor -P "$INGESTOR_PASSWORD"   -t 'appmanager/v1/raw/source-b/telemetry'   -C 1 -W 3 >"$UNAUTHORIZED" 2>/dev/null &
BAD_SUB_PID=$!

sleep 1

set +e
timeout 5s docker run --rm   --network "$NETWORK"   -v "$TMP_DIR/certs:/certs:ro"   "$IMAGE"   mosquitto_pub   -h "$BROKER" -p 8883 --cafile /certs/ca.crt   -u source-a -P "$DEVICE_PASSWORD"   -t 'appmanager/v1/raw/source-b/telemetry'   -m "$PAYLOAD" -q 1 >/dev/null 2>&1
set -e

if wait "$BAD_SUB_PID"; then
  echo "Cross-source publish was delivered despite the ACL." >&2
  exit 1
fi

if [[ -s "$UNAUTHORIZED" ]]; then
  echo "Cross-source publish produced subscriber output." >&2
  exit 1
fi

echo "Mosquitto G16 TLS/ACL contract certified."
