"""Regression tests for rotating LAB 4x24 Modbus FC03 verification (no Docker)."""
from __future__ import annotations

import contextlib
import datetime as dt
import importlib.util
import io
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT=(Path(__file__).resolve().parents[2]/"scripts"/"telemetry"/
        "verify-bdfb-lab-modbus-fc03.py")
spec=importlib.util.spec_from_file_location("lab_modbus_fc03_rotation",SCRIPT)
assert spec and spec.loader
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def snapshot(panel4_age: float, *, source_age: float = 5) -> dict:
    now=dt.datetime.now(dt.timezone.utc)
    result={}
    for serial in module.MAP:
        result[serial]={}
        for panel in range(1,5):
            age=panel4_age if panel==4 else source_age
            instant=now-dt.timedelta(seconds=age)
            result[serial][str(panel)]={
                "receivedAt":instant.isoformat().replace("+00:00","Z"),
                "values":{"U1":"12.43","I1":"2.62","P1":"32.57","EP1":"0.10353"}
            }
    return result


class RotatingPanelsFC03Test(unittest.TestCase):
    def test_freshness_matches_emulator_and_gateway_contract(self):
        self.assertLess(20,module.MAX_PANEL_AGE_SECONDS)
        self.assertLess(module.MAX_PANEL_AGE_SECONDS,30)
        self.assertTrue(module.comparison(
            (12.43,2.62,32.57,.10353),
            (12.430000305,2.619999885,32.569999694,.103529997)))
        self.assertFalse(module.comparison(
            (12.43,2.62,32.57,.10353), (0.,0.,0.,0.)))

    def test_25_point_2_seconds_is_not_false_stale(self):
        rows=snapshot(25.2)
        with patch.object(module,"observations",return_value=rows),\
             patch.object(module,"read_fc03",return_value=(
                 12.430000305,2.619999885,32.569999694,.103529997)):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                module.verify_samples(budget_seconds=5,poll_seconds=.01)
        self.assertIn("FC03 PASS: 8/8",output.getvalue())

    def test_retries_stale_fourth_panel_until_next_rotation(self):
        old=snapshot(35)
        fresh=snapshot(5)
        with patch.object(module,"observations",side_effect=[old,fresh,fresh]),\
             patch.object(module,"read_fc03",return_value=(
                 12.430000305,2.619999885,32.569999694,.103529997)),\
             patch.object(module.time,"sleep",return_value=None) as sleeper:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                module.verify_samples(budget_seconds=5,poll_seconds=.01)
        self.assertIn("FC03 PASS: 8/8",output.getvalue())
        self.assertEqual(sleeper.call_count,1)

    def test_stopped_source_never_passes_even_if_old_values_match(self):
        old=snapshot(45,source_age=45)
        with patch.object(module,"observations",return_value=old),\
             patch.object(module,"read_fc03",side_effect=AssertionError(
                 "do not read stale gateway values")):
            with self.assertRaisesRegex(RuntimeError,"only 0/8"):
                module.verify_samples(budget_seconds=0,poll_seconds=0)

    def test_mismatch_is_not_silently_accepted(self):
        rows=snapshot(5)
        with patch.object(module,"observations",return_value=rows),\
             patch.object(module,"read_fc03",return_value=(0.,0.,0.,0.)):
            with self.assertRaisesRegex(RuntimeError,"only 0/8"):
                module.verify_samples(budget_seconds=0,poll_seconds=0)

    def test_source_stopping_before_final_audit_is_failure(self):
        fresh=snapshot(5)
        old=snapshot(45,source_age=45)
        with patch.object(module,"observations",side_effect=[fresh,old]),\
             patch.object(module,"read_fc03",return_value=(
                 12.430000305,2.619999885,32.569999694,.103529997)):
            with self.assertRaisesRegex(RuntimeError,"no longer LIVE"):
                module.verify_samples(budget_seconds=5,poll_seconds=0)


if __name__=="__main__":
    unittest.main()
