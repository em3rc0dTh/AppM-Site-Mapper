from industrial import insert_industrial, query_industrial
import hmac
import hashlib
import math
import json
import os
from pathlib import Path
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import psycopg
from psycopg.types.json import Jsonb

WINDOWS = {
    "24h": ("24 hours", "5 minutes"),
    "7d": ("7 days", "30 minutes"),
    "15d": ("15 days", "1 hour"),
    "1M": ("30 days", "2 hours"),
}

DSN = os.environ["TIMESCALE_DSN"]
HOST = os.getenv("STORE_HOST", "0.0.0.0")
PORT = int(os.getenv("STORE_PORT", "8080"))
MAX_BODY = 2_000_000
MAX_READINGS = 256
ACCESS_TOKEN = os.getenv("TELEMETRY_STORE_TOKEN", "").strip()
if os.getenv("STORE_ENV") == "production" and len(ACCESS_TOKEN) < 32:
    raise RuntimeError("Production telemetry store requires TELEMETRY_STORE_TOKEN (>=32 chars)")


def record(value):
    return value if isinstance(value, dict) else None


def text_value(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def number_value(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def insert_samples(payload):
    body = record(payload)
    if body is None:
        raise ValueError("invalid payload")

    source_identity = text_value(body.get("sourceIdentity"))
    device_id = text_value(body.get("deviceId"))
    received_at = timestamp(body.get("receivedAt"))
    message_id = text_value(body.get("messageId"))
    readings = body.get("readings")

    if not source_identity or not device_id or received_at is None or not isinstance(readings, list):
        raise ValueError("invalid sample envelope")
    if len(readings) > MAX_READINGS:
        raise ValueError("too many readings")

    rows = []
    for item in readings:
        reading = record(item)
        if reading is None:
            raise ValueError("invalid reading")

        observed_at = timestamp(reading.get("observedAt"))
        shelf_id = text_value(reading.get("shelfId"))
        frame_id = text_value(reading.get("frameId"))
        panel_id = text_value(reading.get("panelId"))
        breaker_id = text_value(reading.get("breakerId"))
        raw_point_id = text_value(reading.get("rawPointId"))
        state = text_value(reading.get("state"))
        voltage_v = number_value(reading.get("voltageV"))
        current_a = number_value(reading.get("currentA"))
        power_w = number_value(reading.get("powerW"))
        energy_kwh = number_value(reading.get("energyKwh"))

        if (
            observed_at is None
            or not shelf_id
            or not frame_id
            or not panel_id
            or not breaker_id
            or not raw_point_id
        ):
            raise ValueError("invalid reading identity")

        if all(value is None for value in (voltage_v, current_a, power_w, energy_kwh)):
            continue

        rows.append(
            (
                observed_at,
                received_at,
                source_identity,
                device_id,
                shelf_id,
                frame_id,
                panel_id,
                breaker_id,
                raw_point_id,
                message_id,
                state,
                voltage_v,
                current_a,
                power_w,
                energy_kwh,
            )
        )

    if not rows:
        return 0

    sql = """
    INSERT INTO telemetry_samples (
      observed_at,
      received_at,
      source_identity,
      device_id,
      shelf_id,
      frame_id,
      panel_id,
      breaker_id,
      raw_point_id,
      message_id,
      state,
      voltage_v,
      current_a,
      power_w,
      energy_kwh
    ) VALUES (
      %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
    )
    ON CONFLICT DO NOTHING
    """

    with psycopg.connect(DSN, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)

    return len(rows)


def insert_entity_sample(sample):
    if not isinstance(sample, dict):
        raise ValueError("invalid entity sample")
    target_id = text_value(sample.get("targetId"))
    target_type = sample.get("targetType")
    source = text_value(sample.get("sourceIdentity"))
    binding = text_value(sample.get("bindingId"))
    received = timestamp(sample.get("receivedAt"))
    if (not target_id or target_type not in ("DEVICE", "EQUIPMENT", "ACCESS_PORT")
            or not source or not binding or received is None or received.tzinfo is None
            or not isinstance(sample.get("reported"), dict)):
        raise ValueError("invalid entity identity")
    with psycopg.connect(DSN) as conn:
        conn.execute("""INSERT INTO telemetry_entity_samples
          (target_id, target_type, source_identity, binding_id, received_at, sample)
          VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
          (target_id, target_type, source, binding, received, Jsonb(sample)))
    return 1



class SnmpBatchConflict(Exception):
    pass


class SnmpBatchOutOfOrder(Exception):
    pass


def insert_snmp_batch(payload):
    """Serialize one controller's whole poll in durable storage.

    The source row lock works across workers/Next.js replicas; all samples and
    the monotonic cursor commit or roll back in a single PostgreSQL transaction.
    """
    body = record(payload)
    if body is None:
        raise ValueError("invalid SNMP batch")
    source = text_value(body.get("sourceIdentity"))
    observed = timestamp(body.get("observedAt"))
    samples = body.get("samples")
    if (
        not source or len(source) > 120 or observed is None or observed.tzinfo is None
        or not isinstance(samples, list) or not 1 <= len(samples) <= 64
    ):
        raise ValueError("invalid SNMP batch envelope")

    checked = []
    seen = set()
    for sample in samples:
        s = record(sample)
        if (
            s is None or s.get("protocol") != "SNMP"
            or s.get("targetType") != "ACCESS_PORT"
            or s.get("entityKind") != "ACCESS_PORT"
            or s.get("sourceIdentity") != source
            or timestamp(s.get("sourceObservedAt")) != observed
        ):
            raise ValueError("invalid SNMP sample source")
        target = text_value(s.get("targetId"))
        binding = text_value(s.get("bindingId"))
        received = timestamp(s.get("receivedAt"))
        readings = record(s.get("reported"))
        if (
            not target or not binding or not received or received.tzinfo is None
            or readings is None or not 1 <= len(readings) <= 2
            or set(readings) - {"currentA", "voltageV"}
            or target in seen
        ):
            raise ValueError("invalid SNMP sample identity")
        seen.add(target)
        normalized = {}
        for metric, point in readings.items():
            r = record(point)
            if r is None or set(r) != {"oid", "value", "unit", "observedAt"}:
                raise ValueError("invalid SNMP reading")
            value = number_value(r.get("value"))
            if (
                value is None or not math.isfinite(value)
                or not text_value(r.get("oid"))
                or r.get("unit") != ("A" if metric == "currentA" else "V")
                or timestamp(r.get("observedAt")) != observed
                or (metric == "currentA" and value < 0)
            ):
                raise ValueError("invalid SNMP metric")
            normalized[metric] = {
                "oid": r["oid"], "value": value,
                "unit": r["unit"], "observedAt": observed.isoformat(),
            }
        checked.append((target, binding, received, s, normalized))

    checked.sort(key=lambda entry: entry[0])
    canonical = [{
        "targetId": target, "bindingId": binding, "reported": normalized
    } for target, binding, _, _, normalized in checked]
    digest = hashlib.sha256(
        json.dumps(canonical, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()

    with psycopg.connect(DSN) as conn:
        # The unique source row serializes first-ever writes as well as existing
        # rows. A crashed transaction releases its lock and rolls back all data.
        conn.execute("""
          INSERT INTO snmp_source_progress (source_identity, last_observed_at)
          VALUES (%s, 'epoch'::timestamptz) ON CONFLICT DO NOTHING
        """, (source,))
        cursor = conn.execute("""
          SELECT last_observed_at FROM snmp_source_progress
          WHERE source_identity = %s FOR UPDATE
        """, (source,)).fetchone()
        previous = conn.execute("""
          SELECT payload_hash FROM snmp_ingest_batches
          WHERE source_identity = %s AND observed_at = %s
        """, (source, observed)).fetchone()
        if previous is not None:
            if previous[0] != digest:
                raise SnmpBatchConflict("SNMP_BATCH_TAMPERED")
            return {"status": "already_committed", "acceptedFeeds": len(checked)}
        if observed <= cursor[0]:
            raise SnmpBatchOutOfOrder("OUT_OF_ORDER_SNMP_SAMPLE")
        for target, binding, received, sample, _ in checked:
            conn.execute("""
              INSERT INTO telemetry_entity_samples
                (target_id, target_type, source_identity, binding_id, received_at, sample)
              VALUES (%s, 'ACCESS_PORT', %s, %s, %s, %s)
            """, (target, source, binding, received, Jsonb(sample)))
        conn.execute("""
          INSERT INTO snmp_ingest_batches
          (source_identity, observed_at, payload_hash, feed_count)
          VALUES (%s, %s, %s, %s)
        """, (source, observed, digest, len(checked)))
        conn.execute("""
          UPDATE snmp_source_progress SET last_observed_at = %s
          WHERE source_identity = %s
        """, (observed, source))
    return {"status": "committed", "acceptedFeeds": len(checked)}


def query_latest_entity_samples(target_ids, target_type):
    """Recover latest metric packets per target; no made-up readings."""
    if not target_ids or len(target_ids) > 64:
        raise ValueError("invalid target ids")
    with psycopg.connect(DSN) as conn:
        rows = conn.execute("""SELECT sample FROM (
           SELECT sample, target_id, received_at,
             ROW_NUMBER() OVER (PARTITION BY target_id ORDER BY received_at DESC) AS idx
           FROM telemetry_entity_samples
           WHERE target_type = %s AND target_id = ANY(%s)
             AND received_at >= NOW() - INTERVAL '7 days'
        ) recent WHERE idx <= 4 ORDER BY received_at ASC""",
            (target_type, target_ids)).fetchall()
    return [row[0] for row in rows]


def query_entity_history(target_id, target_type, window):
    interval, bucket = WINDOWS[window]
    # One last packet per source/binding per bucket, not an invented average
    # of incompatible metrics. Calculate bucket once: psycopg creates separate
    # PostgreSQL parameters for repeated %s, even if the same value is passed.
    # DISTINCT ON must use exactly the same expression as the first ORDER BY.
    with psycopg.connect(DSN) as conn:
        rows = conn.execute("""SELECT sample FROM (
          SELECT DISTINCT ON (bucket, source_identity, binding_id)
            sample, received_at FROM (
              SELECT sample, received_at, source_identity, binding_id,
                time_bucket(%s::interval, received_at) AS bucket
              FROM telemetry_entity_samples
              WHERE target_id = %s AND target_type = %s
                AND received_at >= NOW() - %s::interval
            ) bucketed
          ORDER BY bucket DESC, source_identity, binding_id, received_at DESC
          LIMIT 1000
        ) recent ORDER BY received_at ASC""", (bucket, target_id, target_type, interval)).fetchall()
    return [row[0] for row in rows]



def query_snmp_feed_series(target_id, source_identity, window):
    """Bucket raw SNMP shunt samples without inferring consumption during outages.

    Two metrics belong to the same persisted AccessPort sample. Power is
    estimated from simultaneously sampled I * abs(V). Energy uses trapezoids
    between actual packets only when separated by <= 120 seconds. Missing
    samples and periods without paired I/V are never interpolated.
    """
    interval, bucket = WINDOWS[window]
    query = """
      WITH observations AS (
        SELECT received_at,
          (sample->'reported'->'currentA'->>'value')::double precision AS current_a,
          (sample->'reported'->'voltageV'->>'value')::double precision AS voltage_v
        FROM telemetry_entity_samples
        WHERE target_id = %s AND target_type = 'ACCESS_PORT'
          AND source_identity = %s
          AND received_at >= NOW() - %s::interval
          AND sample->>'protocol' = 'SNMP'
      ), measured AS (
        SELECT received_at, current_a, voltage_v,
          CASE WHEN current_a >= 0 AND voltage_v IS NOT NULL
            THEN current_a * ABS(voltage_v) ELSE NULL END AS power_w
        FROM observations
      ), intervals AS (
        SELECT received_at, current_a, voltage_v, power_w,
          LAG(received_at) OVER (ORDER BY received_at) AS previous_at,
          LAG(power_w) OVER (ORDER BY received_at) AS previous_power_w
        FROM measured
      ), buckets AS (
        SELECT time_bucket(%s::interval, received_at) AS period,
          MAX(received_at) AS latest_at,
          AVG(current_a) AS current_a,
          AVG(voltage_v) AS voltage_v,
          AVG(power_w) AS power_w,
          COUNT(*) AS sample_count,
          COUNT(power_w) AS paired_count,
          COALESCE(SUM(
            CASE WHEN previous_at IS NOT NULL AND power_w IS NOT NULL
              AND previous_power_w IS NOT NULL
              AND EXTRACT(EPOCH FROM (received_at - previous_at)) > 0
              AND EXTRACT(EPOCH FROM (received_at - previous_at)) <= 120
            THEN (power_w + previous_power_w) / 2 *
              EXTRACT(EPOCH FROM (received_at - previous_at)) / 3600000.0
            ELSE 0 END
          ), 0) AS estimated_energy_kwh,
          COALESCE(SUM(
            CASE WHEN previous_at IS NOT NULL AND power_w IS NOT NULL
              AND previous_power_w IS NOT NULL
              AND EXTRACT(EPOCH FROM (received_at - previous_at)) > 0
              AND EXTRACT(EPOCH FROM (received_at - previous_at)) <= 120
            THEN EXTRACT(EPOCH FROM (received_at - previous_at))
            ELSE 0 END
          ), 0) AS covered_seconds
        FROM intervals GROUP BY period
      )
      SELECT period, latest_at, current_a, voltage_v, power_w,
        CASE WHEN paired_count = 0 THEN NULL ELSE estimated_energy_kwh END,
        covered_seconds, sample_count
      FROM buckets ORDER BY period ASC LIMIT 1000
    """
    with psycopg.connect(DSN) as conn:
        rows = conn.execute(query, (target_id, source_identity, interval, bucket)).fetchall()
    return [{
        "bucketAt": row[0].isoformat(), "observedAt": row[1].isoformat(),
        "currentA": row[2], "voltageV": row[3], "powerW": row[4],
        "estimatedEnergyKwh": float(row[5]) if row[5] is not None else None,
        "coveredSeconds": float(row[6]), "sampleCount": row[7]
    } for row in rows]

def query_history(serial, window, raw_point_ids):
    if window not in WINDOWS:
        raise ValueError("unsupported window")

    interval, bucket = WINDOWS[window]
    params = [bucket, serial, interval]
    raw_filter = ""

    if raw_point_ids:
        raw_filter = " AND raw_point_id = ANY(%s)"
        params.append(raw_point_ids)

    sql = f"""
    WITH per_point AS (
      SELECT
        time_bucket(%s::interval, observed_at) AS bucket,
        raw_point_id,
        AVG(voltage_v) AS voltage_v,
        AVG(current_a) AS current_a,
        AVG(power_w) AS power_w,
        AVG(energy_kwh) AS energy_kwh
      FROM telemetry_samples
      WHERE source_identity = %s
        AND observed_at >= NOW() - %s::interval
        {raw_filter}
      GROUP BY bucket, raw_point_id
    )
    SELECT
      bucket,
      AVG(voltage_v) AS voltage_v,
      AVG(current_a) AS current_a,
      AVG(power_w) AS power_w,
      AVG(energy_kwh) AS energy_kwh,
      COUNT(*) AS active_breakers
    FROM per_point
    GROUP BY bucket
    ORDER BY bucket ASC
    """

    with psycopg.connect(DSN, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return [
        {
            "observedAt": row[0].isoformat(),
            "voltageV": None if row[1] is None else float(row[1]),
            "currentA": None if row[2] is None else float(row[2]),
            "powerW": None if row[3] is None else float(row[3]),
            "energyKwh": None if row[4] is None else float(row[4]),
            "activeBreakers": int(row[5]),
        }
        for row in rows
    ]


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if not ACCESS_TOKEN:
            return True
        supplied = self.headers.get("Authorization", "")
        expected = "Bearer " + ACCESS_TOKEN
        return hmac.compare_digest(supplied, expected)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/health":
            try:
                with psycopg.connect(DSN, autocommit=True) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                        cur.fetchone()
                self.send_json(HTTPStatus.OK, {"status": "ok"})
            except Exception:
                self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"status": "unavailable"})
            return

        if parsed.path in ("/history", "/entity-history", "/entity-latest", "/snmp-feed-series", "/industrial-history") and not self.authorized():
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return

        if parsed.path == "/industrial-history":
            try:
                self.send_json(HTTPStatus.OK, query_industrial(DSN, parse_qs(parsed.query)))
            except ValueError:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid industrial query"})
            except Exception:
                self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "industrial history unavailable"})
            return

        if parsed.path == "/entity-latest":
            query = parse_qs(parsed.query)
            ids = [text_value(value) for value in query.get("targetId", [])]
            target_type = query.get("targetType", [None])[0]
            if (not ids or len(ids) > 64 or not all(ids) or
                    len(set(ids)) != len(ids) or
                    target_type not in ("DEVICE", "EQUIPMENT", "ACCESS_PORT")):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid latest query"})
                return
            try:
                self.send_json(HTTPStatus.OK, {"samples": query_latest_entity_samples(ids, target_type)})
            except Exception:
                self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "entity latest query failed"})
            return


        if parsed.path == "/snmp-feed-series":
            query = parse_qs(parsed.query)
            target_id = text_value(query.get("targetId", [None])[0])
            source = text_value(query.get("sourceIdentity", [None])[0])
            window = query.get("window", [None])[0]
            if not target_id or len(target_id) > 128 or not source or len(source) > 120 or window not in WINDOWS:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid SNMP series query"})
                return
            try:
                self.send_json(HTTPStatus.OK, {"points": query_snmp_feed_series(target_id, source, window)})
            except Exception:
                self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "SNMP series unavailable"})
            return

        if parsed.path == "/entity-history":
            query = parse_qs(parsed.query)
            target_id = text_value(query.get("targetId", [None])[0])
            target_type = query.get("targetType", [None])[0]
            window = query.get("window", ["24h"])[0]
            if not target_id or target_type not in ("DEVICE", "EQUIPMENT", "ACCESS_PORT") or window not in WINDOWS:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid entity query"})
                return
            try:
                self.send_json(HTTPStatus.OK, {"samples": query_entity_history(target_id, target_type, window)})
            except Exception:
                self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "entity history query failed"})
            return

        if parsed.path != "/history":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return

        query = parse_qs(parsed.query)
        serial = text_value(query.get("serial", [None])[0])
        window = text_value(query.get("window", ["24h"])[0]) or "24h"
        raw_point_ids = [value for value in query.get("rawPointId", []) if text_value(value)]

        if not serial:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "serial is required"})
            return
        if window not in WINDOWS:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "unsupported window"})
            return
        if len(raw_point_ids) > 256:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "too many rawPointId filters"})
            return

        try:
            points = query_history(serial, window, raw_point_ids)
            self.send_json(
                HTTPStatus.OK,
                {"serial": serial, "window": window, "points": points},
            )
        except Exception:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "history query failed"})

    def do_POST(self):
        if urlparse(self.path).path not in ("/samples", "/snmp-batch", "/industrial-batch"):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        if not self.authorized():
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0

        if length < 1 or length > MAX_BODY:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "invalid body size"})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            if urlparse(self.path).path == "/industrial-batch":
                self.send_json(HTTPStatus.ACCEPTED, {"accepted": insert_industrial(DSN, payload)})
                return
            if urlparse(self.path).path == "/snmp-batch":
                result = insert_snmp_batch(payload)
                self.send_json(HTTPStatus.ACCEPTED, result)
                return
            inserted = 0
            if isinstance(payload, dict) and "entitySample" in payload:
                inserted += insert_entity_sample(payload["entitySample"])
            if isinstance(payload, dict) and "readings" in payload:
                inserted += insert_samples(payload)
            elif not isinstance(payload, dict) or "entitySample" not in payload:
                raise ValueError("invalid sample envelope")
            self.send_json(HTTPStatus.ACCEPTED, {"accepted": inserted})
        except (SnmpBatchConflict, SnmpBatchOutOfOrder) as error:
            self.send_json(HTTPStatus.CONFLICT, {"error": str(error)})
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "sample write failed"})

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    with psycopg.connect(DSN) as conn:
        conn.execute(Path(__file__).with_name("002-entity-telemetry.sql").read_text())
        conn.execute(Path(__file__).with_name("003-snmp-atomic-batches.sql").read_text())
        conn.execute(Path(__file__).with_name("004-industrial-observations.sql").read_text())
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"SITE_MAPPER_TELEMETRY_STORE_READY host={HOST} port={PORT}", flush=True)
    server.serve_forever()
