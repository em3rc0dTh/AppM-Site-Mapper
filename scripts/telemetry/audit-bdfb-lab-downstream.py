#!/usr/bin/env python3
"""Read-only Timescale and Modbus ownership audit for the two new LAB BDFBs.

Run after publishing LAB-BDFB-02/03 MQTT. Never creates or modifies
source mappings, Modbus registers, SQL tables, MongoDB or Docker services.
Historical industrial delivery and Modbus publication are separate gates.
"""
from __future__ import annotations

import json
import subprocess
import sys

TIMESCALE = "appm-site-mapper-timescaledb-1"
MONGO = "appm-site-mapper-mongodb-1"
BRIDGE = "appm-site-mapper-modbus-tcp-1"
SOURCES = ("LAB-BDFB-02", "LAB-BDFB-03")
ORIGINAL = {"EMU-BFDB-01": 1, "EMU-BFDB-02": 2, "EMU-BFDB-03": 3}


def docker_exec(container: str, program: str, *args: str, stdin: str | None = None) -> str:
    command = ["docker", "exec", *(["-i"] if stdin is not None else []),
               container, program, *args]
    run = subprocess.run(command, text=True, input=stdin,
                         capture_output=True, timeout=75, check=False)
    if run.returncode:
        raise RuntimeError(
            container + ": command failed (exit " + str(run.returncode) + ") "
            + (run.stderr or "").strip()[:240]
        )
    return run.stdout.strip()


def timescale() -> list[dict]:
    sql = """
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT COALESCE(json_agg(row_to_json(summary)), '[]'::json) FROM (
  SELECT source_identity AS "serial",
         COUNT(*) AS "historyRows",
         COUNT(DISTINCT signal_id) AS "distinctSignals",
         COUNT(*) FILTER (WHERE quality='VALID' AND kind='measurement')
           AS "validMeasurementRows",
         MAX(received_at) AS "lastReceivedAt"
  FROM industrial_observations
  WHERE protocol='MQTT'
    AND source_identity IN ('LAB-BDFB-02','LAB-BDFB-03')
  GROUP BY source_identity
  ORDER BY source_identity
) AS summary;
COMMIT;
"""
    output = docker_exec(TIMESCALE, "psql", "-X", "-A", "-t",
                         "-v", "ON_ERROR_STOP=1", "-U", "site_mapper",
                         "-d", "site_mapper_telemetry", stdin=sql)
    candidates = [line.strip() for line in output.splitlines()
                  if line.lstrip().startswith("[")]
    if len(candidates) != 1:
        raise RuntimeError("Timescale returned no parseable industrial summary")
    value = json.loads(candidates[0])
    if not isinstance(value, list):
        raise RuntimeError("Timescale industrial summary is not a list")
    return value


def mongo_outbox() -> dict:
    script = """
const d=db.getSiblingDB('site_mapper_crud_acceptance_02');
const q=d.industrial_timescale_outbox;
const last=d.industrial_delivery_status.findOne({key:'timescale'});
print(JSON.stringify({
  pending:q.countDocuments({}),
  retrying:q.countDocuments({lastFailureAt:{$exists:true}}),
  lastDeliveryAt:last?.lastDeliveryAt??null,
  failureCount:last?.failures??0
}));
"""
    raw = docker_exec(MONGO, "mongosh", "--quiet", "--eval", script)
    return json.loads(raw.splitlines()[-1])


def modbus_owners() -> dict:
    script = """
const serials=JSON.parse(process.env.MODBUS_SOURCE_UNITS_JSON||'{}');
console.log(JSON.stringify({
  mapping:serials,
  pointLayout:process.env.MODBUS_POINT_LAYOUT||null,
  missingPolicy:process.env.MODBUS_MISSING_POLICY||null
}));
"""
    raw = docker_exec(BRIDGE, "node", "-e", script)
    return json.loads(raw.splitlines()[-1])


def main() -> int:
    print("SITE MAPPER / LAB DOWNSTREAM READ-ONLY AUDIT", flush=True)
    try:
        historical = timescale()
        counts = {item["serial"]: item for item in historical}
        for serial in SOURCES:
            item = counts.get(serial)
            if item:
                print(
                    "TIMESCALE " + serial
                    + " rows=" + str(item["historyRows"])
                    + " uniqueSignals=" + str(item["distinctSignals"])
                    + " validMeasurementRows=" + str(item["validMeasurementRows"])
                    + " lastReceivedAt=" + str(item["lastReceivedAt"])
                )
            else:
                print("TIMESCALE " + serial + ": NO ROWS (delivery not yet proven)")
        print("TIMESCALE completeness is independent of MQTT capture; "
              "check the pending queue before calling missing data lost.")
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError) as error:
        print("TIMESCALE UNAVAILABLE:", error)

    try:
        outbox = mongo_outbox()
        print("TIMESCALE DURABLE OUTBOX:", json.dumps(outbox, ensure_ascii=False))
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError) as error:
        print("OUTBOX UNAVAILABLE:", error)

    try:
        bridge = modbus_owners()
        mapping = bridge.get("mapping")
        if not isinstance(mapping, dict):
            raise RuntimeError("Bridge source mapping is not an object")
        print("MODBUS POINT LAYOUT:", bridge.get("pointLayout"))
        for serial, unit in ORIGINAL.items():
            print("MODBUS EXISTING " + serial + " -> " + str(mapping.get(serial))
                  + (" PRESERVED" if mapping.get(serial) == unit else " CHANGED / REVIEW"))
        for serial in SOURCES:
            print("MODBUS LAB " + serial + " -> "
                  + (str(mapping[serial]) if serial in mapping else "NOT MAPPED"))
        print("MODBUS report is configuration evidence, not an FC03 read "
              "or Metasys interoperability certification.")
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError) as error:
        print("MODBUS CONFIG UNAVAILABLE:", error)

    print("READ ONLY — no project, Docker service, database or point writes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
