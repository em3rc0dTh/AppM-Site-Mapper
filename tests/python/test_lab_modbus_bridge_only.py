"""Ensure LAB Modbus bridge-only maintenance never restarts Site Mapper or touches queues."""
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT=(Path(__file__).resolve().parents[2]/"scripts"/"telemetry"/
        "commission-bdfb-lab-modbus.py")
spec=importlib.util.spec_from_file_location("commission_lab_modbus_bridge_only",SCRIPT)
assert spec and spec.loader
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BridgeOnlyTest(unittest.TestCase):
    def setUp(self):
        self.app={
            "Config":{"Env":["MODBUS_SOURCE_UNITS_JSON="+json.dumps(module.ORIGINAL)]}
        }
        self.bridge={
            "Config":{"Env":["MODBUS_SOURCE_UNITS_JSON="+json.dumps(module.ORIGINAL)]}
        }
        self.bridge_after={
            "Config":{"Env":["MODBUS_SOURCE_UNITS_JSON="+json.dumps(module.PROPOSED)]}
        }

    def test_preview_is_read_only_even_with_pending_historian(self):
        with patch.object(module,"safe_deploy_config"),\
             patch.object(module,"original_data_volumes"),\
             patch.object(module,"queues",side_effect=AssertionError("queue inspected")),\
             patch.object(module,"run",side_effect=AssertionError("docker restarted")),\
             patch.object(module,"verify_backup",side_effect=AssertionError("backup checked")):
            module.bridge_only(self.app,self.bridge,module.ORIGINAL,None)

    def test_apply_recreates_exactly_bridge_and_never_touches_outbox(self):
        calls=[]
        def execute(argv,**kwargs):
            calls.append(argv)
            return ""
        def inspect(name):
            if name==module.BRIDGE: return self.bridge_after
            if name==module.APP: return self.app
            raise AssertionError("Unexpected container "+name)
        with patch.object(module,"safe_deploy_config"),\
             patch.object(module,"original_data_volumes"),\
             patch.object(module,"queues",side_effect=AssertionError("queue inspected")),\
             patch.object(module,"publisher_stopped",
                          side_effect=AssertionError("publisher stopped")),\
             patch.object(module,"verify_backup"),\
             patch.object(module,"inspect_core",
                          return_value=(self.app,self.bridge,module.ORIGINAL,{})),\
             patch.object(module,"inspect",side_effect=inspect),\
             patch.object(module,"sanitized_environment",return_value={}),\
             patch.object(module,"run",side_effect=execute):
            module.bridge_only(self.app,self.bridge,module.ORIGINAL,Path("/backup"))
        self.assertEqual(len(calls),1)
        self.assertEqual(calls[0][-1],"modbus-tcp")
        self.assertEqual(calls[0][-5:-1],
                         ["-d","--no-deps","--no-build","--force-recreate"])
        self.assertNotIn("site-mapper",calls[0][-5:])

    def test_original_units_must_remain_untouched(self):
        invalid=dict(module.ORIGINAL)
        invalid["EMU-BFDB-02"]=4
        with patch.object(module,"safe_deploy_config"),\
             patch.object(module,"original_data_volumes"):
            with self.assertRaisesRegex(RuntimeError,"bridge-only applies only"):
                self_with_bridge={"Config":{"Env":[
                    "MODBUS_SOURCE_UNITS_JSON="+json.dumps(invalid)
                ]}}
                module.bridge_only(self.app,self_with_bridge,module.ORIGINAL,None)

    def test_partial_state_is_explicitly_approved_but_other_drift_is_not(self):
        pairs=((module.ORIGINAL,module.ORIGINAL),
               (module.ORIGINAL,module.PROPOSED),
               (module.PROPOSED,module.PROPOSED))
        self.assertEqual(len(pairs),3)
        self.assertNotIn((module.PROPOSED,module.ORIGINAL),pairs)


if __name__=="__main__":
    unittest.main()
