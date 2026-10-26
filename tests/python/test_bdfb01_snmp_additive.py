"""Static and pure preflight regression gates for additive BDFB-01 SNMPv3 lab."""
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parents[2]/"scripts"/"telemetry"/"commission-bdfb01-snmp-lab.py"
spec=importlib.util.spec_from_file_location("snmp_additive_test_module",SCRIPT)
assert spec and spec.loader
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

TOKEN="s"*40
PROPOSED={"EMU-BFDB-01":1,"EMU-BFDB-02":2,"EMU-BFDB-03":3,
          "LAB-BDFB-02":4,"LAB-BDFB-03":5}


def fake_config():
    return {
        "services":{
            "site-mapper":{"environment":{"SNMP_INGEST_TOKEN":TOKEN}},
            "snmp-lab-agent-01":{
                "networks":{"default":None},
                "environment":{"SNMP_EMULATOR_PROFILE":"ELTEK_BDCBB_CONFIG_2"}
            },
            "snmp-lab-collector-01":{
                "networks":{"default":None},
                "environment":{
                    "SNMP_CONTROLLER_ID":"EMU-DELTA-BFDB-01",
                    "SNMP_INGEST_URL":"http://site-mapper:3000/api/telemetry/snmp/ingest"
                }
            }
        }
    }


def fake_app():
    return {"Config":{"Env":[
        "SNMP_INGEST_TOKEN="+TOKEN,"APP_ENV=development",
        "TELEMETRY_HISTORY_ENABLED=true"
    ]}}


def fake_bridge():
    return {"Config":{"Env":[
        "MODBUS_SOURCE_UNITS_JSON="+json.dumps(PROPOSED)
    ]}}


class SnmpAdditiveTest(unittest.TestCase):
    def test_full_static_safe_config(self):
        mod.compare_before_after(fake_config(),fake_app(),fake_bridge())

    def test_rejects_incorrect_original_modbus_map(self):
        wrong=fake_bridge()
        wrong["Config"]["Env"]=["MODBUS_SOURCE_UNITS_JSON="+json.dumps(
            {"EMU-BFDB-01":1,"EMU-BFDB-02":3}
        )]
        with self.assertRaisesRegex(RuntimeError,"Modbus map drifted"):
            mod.compare_before_after(fake_config(),fake_app(),wrong)

    def test_rejects_secret_mismatch(self):
        bad=fake_config()
        bad["services"]["site-mapper"]["environment"]["SNMP_INGEST_TOKEN"]="t"*40
        with self.assertRaisesRegex(RuntimeError,"token differs"):
            mod.compare_before_after(bad,fake_app(),fake_bridge())

    def test_rejects_public_udp_port(self):
        bad=fake_config()
        bad["services"]["snmp-lab-agent-01"]["ports"]=[{"published":11611}]
        with self.assertRaisesRegex(RuntimeError,"host port"):
            mod.compare_before_after(bad,fake_app(),fake_bridge())

    def test_rejects_other_network(self):
        bad=fake_config()
        bad["services"]["snmp-lab-agent-01"]["networks"]={"industrial-lab":None}
        with self.assertRaisesRegex(RuntimeError,"private default network"):
            mod.compare_before_after(bad,fake_app(),fake_bridge())

    def test_requires_agent_profile_and_source_identity(self):
        bad=fake_config()
        bad["services"]["snmp-lab-agent-01"]["environment"]["SNMP_EMULATOR_PROFILE"]="ELTEK_BDCBB_CONFIG_4"
        with self.assertRaisesRegex(RuntimeError,"hardware profile mismatch"):
            mod.compare_before_after(bad,fake_app(),fake_bridge())
        bad=fake_config()
        bad["services"]["snmp-lab-collector-01"]["environment"]["SNMP_CONTROLLER_ID"]="LAB-BDFB-01"
        with self.assertRaisesRegex(RuntimeError,"source identity changed"):
            mod.compare_before_after(bad,fake_app(),fake_bridge())

    def test_snmpv3_only_never_uses_unsecured_v2c(self):
        credential={"SNMP_VERSION":"3","SNMP_EMULATOR_PROFILE":"ELTEK_BDCBB_CONFIG_2",
                    "SNMP_V3_USERNAME":"lab_readonly",
                    "SNMP_V3_AUTH_KEY":"abcdefgh123","SNMP_V3_PRIV_KEY":"privateABC"}
        env=mod.vetted_environment(credential,Path("/approved-checkout"),
                                   mod.environs(fake_app()))
        self.assertEqual(env["SNMP_INGEST_TOKEN"],TOKEN)
        self.assertEqual(env["BFDB_SNMP_LAB_CONTEXT"],"/approved-checkout")
        credential["SNMP_VERSION"]="2c"
        with self.assertRaisesRegex(RuntimeError,"only SNMPv3"):
            mod.vetted_environment(credential,Path("/approved-checkout"),
                                   mod.environs(fake_app()))


if __name__=="__main__":
    unittest.main()
