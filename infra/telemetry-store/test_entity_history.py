"""Regression checks for the Site Mapper Timescale entity-history query.

Mock only the DB transport; production query text and arguments are exercised.
A real TimescaleDB smoke test is still required for deployment certification.
"""

import importlib.util
from datetime import datetime, timezone
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


class FakeConnection:
    def __init__(self):
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, sql, params):
        self.executed.append((sql, params))
        return self

    def fetchall(self):
        return [({"sourceIdentity": "EMU-BFDB-03"},)]


class EntityHistoryQueryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # The query is exercised without a live database or extra CI packages.
        fake_psycopg = types.ModuleType("psycopg")
        fake_psycopg.__path__ = []
        fake_types = types.ModuleType("psycopg.types")
        fake_types.__path__ = []
        fake_json = types.ModuleType("psycopg.types.json")
        fake_json.Jsonb = lambda value: value

        cls.connection = FakeConnection()
        fake_psycopg.connect = lambda _: cls.connection
        modules = {
            "psycopg": fake_psycopg,
            "psycopg.types": fake_types,
            "psycopg.types.json": fake_json,
        }
        source = Path(__file__).with_name("app.py")
        spec = importlib.util.spec_from_file_location("site_mapper_history_under_test", source)
        with patch.dict(sys.modules, modules), patch.dict(os.environ, {"TIMESCALE_DSN": "postgresql://example/test"}):
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        cls.app = module

    def setUp(self):
        self.connection.executed.clear()

    def test_all_history_windows_use_a_single_bucket_expression(self):
        for window, (range_interval, bucket_interval) in self.app.WINDOWS.items():
            with self.subTest(window=window):
                result = self.app.query_entity_history("equipment-01", "EQUIPMENT", window)
                self.assertEqual(result, [{"sourceIdentity": "EMU-BFDB-03"}])
                self.assertEqual(len(self.connection.executed), 1)
                sql, params = self.connection.executed.pop()
                self.assertEqual(params, (bucket_interval, "equipment-01", "EQUIPMENT", range_interval))
                self.assertEqual(sql.count("%s"), 4)
                self.assertEqual(sql.count("time_bucket("), 1)
                self.assertIn("time_bucket(%s::interval, received_at) AS bucket", sql)
                self.assertIn("DISTINCT ON (bucket, source_identity, binding_id)", sql)
                self.assertIn(
                    "ORDER BY bucket DESC, source_identity, binding_id, received_at DESC",
                    sql,
                )
                self.assertIn(") recent ORDER BY received_at ASC", sql)


    def test_latest_entity_query_preserves_independent_points(self):
        self.app.query_latest_entity_samples(["feed-A", "feed-B"], "ACCESS_PORT")
        sql, params = self.connection.executed[-1]
        self.assertEqual(params, ("ACCESS_PORT", ["feed-A", "feed-B"]))
        self.assertIn("ROW_NUMBER() OVER (PARTITION BY target_id", sql)
        self.assertIn("target_id = ANY(%s)", sql)
        self.assertIn("idx <= 4", sql)


    def test_snmp_series_queries_raw_paired_current_voltage_and_bounded_energy(self):
        now = datetime(2026, 10, 22, 14, 39, 9, tzinfo=timezone.utc)
        self.connection.fetchall = lambda: [(
            now, now, 214.9, -53.2, 11432.68, 0.0019, 60, 3
        )]
        try:
            result = self.app.query_snmp_feed_series("shunt-A", "EMU-DELTA-BFDB-01", "24h")
        finally:
            del self.connection.fetchall
        self.assertEqual(result[0]["currentA"], 214.9)
        self.assertEqual(result[0]["voltageV"], -53.2)
        self.assertEqual(result[0]["estimatedEnergyKwh"], 0.0019)
        self.assertEqual(result[0]["coveredSeconds"], 60.0)
        sql, params = self.connection.executed[-1]
        self.assertEqual(params, ("shunt-A", "EMU-DELTA-BFDB-01", "24 hours", "5 minutes"))
        self.assertIn("source_identity = %s", sql)
        self.assertIn("sample->'reported'->'currentA'", sql)
        self.assertIn("sample->'reported'->'voltageV'", sql)
        self.assertIn("LAG(power_w)", sql)
        self.assertIn("<= 120", sql)
        self.assertIn("ABS(voltage_v)", sql)
        self.assertIn("time_bucket(%s::interval, received_at)", sql)

    def test_distinct_on_does_not_order_by_separately_bound_bucket_expression(self):
        self.app.query_entity_history("device-01", "DEVICE", "24h")
        sql, _ = self.connection.executed[-1]
        self.assertNotIn("ORDER BY time_bucket(", sql)
        self.assertNotIn("DISTINCT ON (time_bucket(", sql)


if __name__ == "__main__":
    unittest.main()
