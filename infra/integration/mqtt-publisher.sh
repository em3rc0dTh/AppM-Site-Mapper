#!/bin/sh
set -eu

HOST="${MQTT_HOST:-mosquitto}"
PORT="${MQTT_PORT:-1883}"
INTERVAL="${MQTT_PUBLISH_INTERVAL_SECONDS:-5}"
MSGID=1000

publish_cycle() {
  for serial in 26092403950003 26092403950004 26092403950002; do
    for panel in 1 2 3 4; do
      reported="{"
      pos=1
      while [ "$pos" -le 24 ]; do
        voltage="$(awk "BEGIN { printf \"%.2f\", 51.8 + (($pos % 5) * 0.1) }")"
        current="$(awk "BEGIN { printf \"%.2f\", 8.0 + (($pos % 7) * 0.5) }")"
        power="$(awk "BEGIN { printf \"%.2f\", $voltage * $current }")"
        energy="$(awk "BEGIN { printf \"%.4f\", 1.0 + ($pos * 0.01) }")"
        point="\"0_${panel}_${pos}\":{\"state\":\"ONLINE\",\"U1\":\"${voltage}\",\"U2\":\"0.00\",\"I1\":\"${current}\",\"I2\":\"0.00\",\"P1\":\"${power}\",\"P2\":\"0.00\",\"EP1\":\"${energy}\",\"EP2\":\"0.00\"}"
        if [ "$pos" -gt 1 ]; then reported="${reported},"; fi
        reported="${reported}${point}"
        pos=$((pos + 1))
      done
      reported="${reported}}"
      # Timestamp each message at publish time. A cycle builds 12 payloads and can
      # take long enough on slow local Docker/WSL hosts that a cycle-level epoch
      # exceeds the 30s source-vs-receive clock-skew contract.
      epoch="$(date +%s)"
      payload="{\"msgid\":\"${MSGID}\",\"method\":\"update\",\"sn\":\"${serial}\",\"timestamp\":${epoch},\"sendtime\":${epoch},\"version\":1,\"reported\":${reported}}"
      mosquitto_pub -h "$HOST" -p "$PORT" -q 1 -t "data/dev/${serial}" -m "$payload"
      MSGID=$((MSGID + 1))
    done
  done
}

until mosquitto_pub -h "$HOST" -p "$PORT" -t integration/health -m ready >/dev/null 2>&1; do
  sleep 1
done

while true; do
  publish_cycle
  sleep "$INTERVAL"
done
