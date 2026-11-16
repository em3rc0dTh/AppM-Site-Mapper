"""Real TimescaleDB integration: rollback, exact replay, tamper and concurrency.

Executed inside a disposable telemetry-store container only; no production DB.
"""
import concurrent.futures
import importlib
import os
import uuid
import unittest
from datetime import datetime, timezone, timedelta

import psycopg

app = importlib.import_module("app")
DSN = os.environ["TIMESCALE_DSN"]


class AtomicSnmpTests(unittest.TestCase):
    def setUp(self):
        self.source = "CI-ATOMIC-" + uuid.uuid4().hex
        self.at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        self.received = self.at
        self.targets = [self.source + "-" + feed for feed in ("A1", "A2", "B1", "B2")]

    def tearDown(self):
        with psycopg.connect(DSN) as db:
            db.execute("DELETE FROM telemetry_entity_samples WHERE source_identity = %s", (self.source,))
            db.execute("DELETE FROM snmp_ingest_batches WHERE source_identity = %s", (self.source,))
            db.execute("DELETE FROM snmp_source_progress WHERE source_identity = %s", (self.source,))

    def packet(self, currents=(220, 210, 205, 200), observed=None):
        observed = observed or self.at
        return {
            "sourceIdentity": self.source,
            "observedAt": observed,
            "samples": [{
                "bindingId": "snmp:feed:" + self.source + ":" + target,
                "targetId": target,
                "targetType": "ACCESS_PORT",
                "entityId": target,
                "entityKind": "ACCESS_PORT",
                "sourceIdentity": self.source,
                "protocol": "SNMP",
                "sourceObservedAt": observed,
                "receivedAt": self.received,
                "reported": {"currentA": {
                    "value": float(value),
                    "unit": "A",
                    "observedAt": observed,
                    "oid": f"1.3.6.1.4.1.8072.9999.2026.49.1.{i+1}.0",
                }},
            } for i, (target, value) in enumerate(zip(self.targets, currents))],
        }

    def count(self):
        with psycopg.connect(DSN) as db:
            rows = db.execute(
                "SELECT count(*) FROM telemetry_entity_samples WHERE source_identity = %s",
                (self.source,),
            ).fetchone()[0]
            batches = db.execute(
                "SELECT count(*) FROM snmp_ingest_batches WHERE source_identity = %s",
                (self.source,),
            ).fetchone()[0]
            return rows, batches

    def test_atomic_rollback_then_same_packet_retry(self):
        # Force the third feed's SQL insert to fail. The first two must roll back.
        with psycopg.connect(DSN) as db:
            db.execute("""
              CREATE OR REPLACE FUNCTION ci_reject_b1_sample()
              RETURNS trigger LANGUAGE plpgsql AS $$
              BEGIN
                IF NEW.target_id LIKE 'CI-ATOMIC-%-B1' THEN
                  RAISE EXCEPTION 'injected third-feed failure';
                END IF;
                RETURN NEW;
              END
              $$;
            """)
            db.execute("""
              CREATE TRIGGER ci_fail_b1_snmp
              BEFORE INSERT ON telemetry_entity_samples
              FOR EACH ROW EXECUTE FUNCTION ci_reject_b1_sample()
            """)
        try:
            with self.assertRaises(psycopg.Error):
                app.insert_snmp_batch(self.packet())
            self.assertEqual(self.count(), (0, 0))
        finally:
            with psycopg.connect(DSN) as db:
                db.execute("DROP TRIGGER ci_fail_b1_snmp ON telemetry_entity_samples")
                db.execute("DROP FUNCTION ci_reject_b1_sample()")
        self.assertEqual(app.insert_snmp_batch(self.packet())["status"], "committed")
        self.assertEqual(self.count(), (4, 1))

    def test_exact_retry_after_unknown_ack_and_conflicting_replay(self):
        self.assertEqual(app.insert_snmp_batch(self.packet())["status"], "committed")
        duplicate = self.packet()
        duplicate["samples"].reverse()
        duplicate["samples"][0]["receivedAt"] = (
            datetime.now(timezone.utc) + timedelta(seconds=1)
        ).isoformat()
        self.assertEqual(app.insert_snmp_batch(duplicate)["status"], "already_committed")
        self.assertEqual(self.count(), (4, 1))
        with self.assertRaises(app.SnmpBatchConflict):
            app.insert_snmp_batch(self.packet((299, 210, 205, 200)))
        self.assertEqual(self.count(), (4, 1))

    def test_two_replica_race_is_serialized_by_database(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(app.insert_snmp_batch, [self.packet(), self.packet()]))
        self.assertEqual(sorted(x["status"] for x in outcomes), ["already_committed", "committed"])
        self.assertEqual(self.count(), (4, 1))
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            work = [pool.submit(app.insert_snmp_batch, self.packet((230, 210, 205, 200))),
                    pool.submit(app.insert_snmp_batch, self.packet((240, 210, 205, 200)))]
            for task in work:
                with self.assertRaises(app.SnmpBatchConflict):
                    task.result()
        self.assertEqual(self.count(), (4, 1))

    def test_monotonic_order_survives_new_transaction(self):
        later = (datetime.fromisoformat(self.at) + timedelta(seconds=2)).isoformat()
        self.assertEqual(app.insert_snmp_batch(self.packet(observed=later))["status"], "committed")
        with self.assertRaises(app.SnmpBatchOutOfOrder):
            app.insert_snmp_batch(self.packet())
        self.assertEqual(self.count(), (4, 1))


if __name__ == "__main__":
    unittest.main(verbosity=2)
