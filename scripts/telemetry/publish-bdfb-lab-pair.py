#!/usr/bin/env python3
"""Independent synthetic BFDB-02 and BFDB-03 MQTT publishers for original stack.

PREVIEW (no publish): python3 scripts/telemetry/publish-bdfb-lab-pair.py
FOREGROUND LAB EMULATION: python3 scripts/telemetry/publish-bdfb-lab-pair.py --publish
4 cycles: python3 scripts/telemetry/publish-bdfb-lab-pair.py --publish --cycles 4

Never remap EMU-BFDB-02/03, which currently belong to BDFB-01.
No new containers, volumes, Docker compose projects or Python packages.
Only docker exec mosquitto_pub to the existing active lab broker.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import time

BROKER_CONTAINER = "appm-site-mapper-lab-mosquitto-1"
SOURCES = (
    ("LAB-BDFB-02", 12.42, 2.7),
    ("LAB-BDFB-03", 12.65, 1.9),
)
FIELDS = ("U1", "U2", "I1", "I2", "P1", "P2", "EP1", "EP2")
PER_PANEL = 24
TOTAL_CIRCUITS = 96
BATCH_SIZE = 24


def payload(serial: str, nominal: float, base_a: float, cycle: int, interval: float,
            msgid: int) -> dict:
    start = (cycle % (TOTAL_CIRCUITS // BATCH_SIZE)) * BATCH_SIZE + 1
    reported: dict[str, dict[str, str]] = {}
    elapsed_hours = cycle * interval / 3600
    for circuit in range(start, start + BATCH_SIZE):
        panel = (circuit - 1) // PER_PANEL + 1
        position = (circuit - 1) % PER_PANEL + 1
        voltage = nominal + 0.02 * math.sin((cycle + circuit) * 0.13)
        current = max(0.0, base_a + 0.12 * (circuit % 12) +
                      0.2 * math.sin((cycle + circuit) * 0.09))
        power = voltage * current
        # Monotonically increasing synthetic kWh, not a field meter reading.
        energy = 0.1 + circuit / 1000 + (power / 1000) * elapsed_hours
        reported[f"0_{panel}_{position}"] = {
            "state": "ONLINE",
            "U1": f"{voltage:.2f}", "U2": "0.00",
            "I1": f"{current:.2f}", "I2": "0.00",
            "P1": f"{power:.2f}", "P2": "0.00",
            "EP1": f"{energy:.5f}", "EP2": "0.00",
        }
    stamp = int(time.time())
    return {
        "msgid": str(msgid),
        "method": "update",
        "sn": serial,
        "timestamp": stamp,
        "sendtime": stamp,
        "version": 1,
        "reported": reported,
    }


def publish(topic: str, message: dict) -> None:
    body = json.dumps(message, separators=(",", ":"))
    result = subprocess.run(
        ["docker", "exec", BROKER_CONTAINER, "mosquitto_pub",
         "-h", "127.0.0.1", "-p", "1883", "-q", "1",
         "-t", topic, "-m", body],
        text=True, capture_output=True, timeout=20, check=False,
    )
    if result.returncode:
        raise RuntimeError(
            f"MQTT publish failed for {topic}: "
            + (result.stderr.strip()[:300] or f"exit={result.returncode}")
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish", action="store_true",
                        help="Actually publish to existing lab MQTT broker")
    parser.add_argument("--cycles", type=int, default=0,
                        help="Number of cycles (0 = continuous; only with --publish)")
    parser.add_argument("--interval", type=float, default=5.0,
                        help="Seconds between 24-point batches, default 5")
    args = parser.parse_args()
    if not 2 <= args.interval <= 60:
        parser.error("--interval must be within 2..60 seconds")
    if args.cycles < 0:
        parser.error("--cycles cannot be negative")
    if args.cycles and not args.publish:
        parser.error("--cycles requires --publish")

    print("LAB MQTT BFDB pair | topic=data/dev/LAB-BDFB-02 and /LAB-BDFB-03")
    print(f"24 circuits per source per {args.interval:g}s; "
          "96 per source each 4 cycles; source identities do NOT overlap originals")
    if not args.publish:
        for serial, nominal, base in SOURCES:
            data = payload(serial, nominal, base, 0, args.interval, 1)
            print(json.dumps({
                "mode": "preview", "source": serial,
                "topic": f"data/dev/{serial}",
                "batchSize": len(data["reported"]),
                "firstPoint": next(iter(data["reported"].items())),
            }, ensure_ascii=False))
        print("PREVIEW ONLY: nothing sent.")
        return 0

    message_id = time.time_ns()
    cycle = 0
    start = time.monotonic()
    try:
        while not args.cycles or cycle < args.cycles:
            for serial, nominal, base in SOURCES:
                packet = payload(serial, nominal, base, cycle, args.interval,
                                 message_id)
                topic = f"data/dev/{serial}"
                publish(topic, packet)
                first, last = list(packet["reported"])[0], list(packet["reported"])[-1]
                print(f"PUBLISHED source={serial} topic={topic} points=24 "
                      f"range={first}..{last} msgid={message_id}", flush=True)
                message_id += 1
            cycle += 1
            delay = start + cycle * args.interval - time.monotonic()
            if delay > 0 and (not args.cycles or cycle < args.cycles):
                time.sleep(delay)
    except KeyboardInterrupt:
        print("LAB MQTT pair stopped. Source quality becomes STALE/OFFLINE.")
    except (OSError, subprocess.TimeoutExpired, RuntimeError) as error:
        print("ERROR:", error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
