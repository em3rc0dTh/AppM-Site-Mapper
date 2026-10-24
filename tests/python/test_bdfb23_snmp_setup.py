"""Contrato offline de no-recreación y separación de fuentes SNMP 02/03."""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location(
    "bdfb23_snmp_setup",ROOT/"scripts/telemetry/setup-bdfb23-snmp-lab.py")
assert SPEC and SPEC.loader
setup=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(setup)


def obj(env):
    return {"Config":{"Env":[f"{k}={v}" for k,v in env.items()]}}


def proposal():
    original={"site-mapper":{"environment":{"SNMP_INGEST_TOKEN":"p"*40}}}
    for number in ("02","03"):
        source="EMU-DELTA-BFDB-"+number
        original["snmp-lab-agent-"+number]={
            "networks":{"default":None},
            "environment":{"SNMP_EMULATOR_BFDB_ID":"BFDB-"+number,
              "SNMP_EMULATOR_SOURCE_ID":source,
              "SNMP_EMULATOR_PROFILE":"ELTEK_BDCBB_CONFIG_2"}}
        original["snmp-lab-collector-"+number]={
            "networks":{"default":None},
            "environment":{"SNMP_CONTROLLER_ID":source,
              "SNMP_CONTROLLER_HOST":"snmp-lab-agent-"+number,
              "SNMP_VERSION":"3",
              "SNMP_INGEST_TOKEN":"p"*40,
              "SNMP_INGEST_URL":"http://site-mapper:3000/api/telemetry/snmp/ingest"}}
    return {"name":"appm-site-mapper","services":original}


class SafetyTest(unittest.TestCase):
    def setUp(self):
        self.app=obj({"SNMP_INGEST_TOKEN":"p"*40,
                      "APP_ENV":"development","TELEMETRY_HISTORY_ENABLED":"true"})
        self.bridge=obj({"MODBUS_SOURCE_UNITS_JSON":json.dumps(setup.ORIGINAL_UNITS)})

    def test_valid_additive_services(self):
        setup.verify_overlay(proposal(),self.app,self.bridge)
        self.assertEqual(len(setup.SERVICES),4)

    def test_rejects_changed_unit_assignments(self):
        self.bridge=obj({"MODBUS_SOURCE_UNITS_JSON":json.dumps(
            {"EMU-BFDB-01":1,"EMU-BFDB-02":2,"EMU-BFDB-03":3})})
        with self.assertRaisesRegex(RuntimeError,"Modbus"):
            setup.verify_overlay(proposal(),self.app,self.bridge)

    def test_rejects_public_snmp_port(self):
        c=proposal()
        c["services"]["snmp-lab-agent-02"]["ports"]=[{"published":11612}]
        with self.assertRaisesRegex(RuntimeError,"host"):
            setup.verify_overlay(c,self.app,self.bridge)

    def test_rejects_wrong_controller(self):
        c=proposal()
        c["services"]["snmp-lab-collector-03"]["environment"][
            "SNMP_CONTROLLER_ID"]="EMU-DELTA-BFDB-01"
        with self.assertRaisesRegex(RuntimeError,"identity"):
            setup.verify_overlay(c,self.app,self.bridge)

    def test_private_snmp_v3_is_required(self):
        e={"SNMP_VERSION":"3","SNMP_EMULATOR_PROFILE":"ELTEK_BDCBB_CONFIG_2",
           "SNMP_V3_USERNAME":"labadmin",
           "SNMP_V3_AUTH_KEY":"abcdefghijkl","SNMP_V3_PRIV_KEY":"qrstuvwxyz98"}
        got=setup.safe_env(e,Path("/safe"),
              setup.env_from(self.app))
        self.assertEqual(got["SNMP_INGEST_TOKEN"],"p"*40)
        e["SNMP_VERSION"]="2c"
        with self.assertRaisesRegex(RuntimeError,"SNMPv3"):
            setup.safe_env(e,Path("/safe"),setup.env_from(self.app))

    def test_mongo_commission_has_no_orig_mqtt_or_timescale_mutations(self):
        code=setup.JS.read_text(encoding="utf8")
        self.assertIn("session.startTransaction",code)
        self.assertIn("LAB_SYNTHETIC_ONLY",code)
        self.assertIn("independentInputConfirmed:false",code)
        self.assertIn("lab:snmp:",code)
        self.assertIn("LAB-BDFB-02",code)
        self.assertIn("LAB-BDFB-03",code)
        self.assertNotIn("dropDatabase(",code)
        self.assertNotIn("deleteMany(",code)

    def test_no_service_recreation_or_original_mongo_restore(self):
        code=(ROOT/"scripts/telemetry/setup-bdfb23-snmp-lab.py").read_text(encoding="utf8")
        self.assertIn('"--no-deps","--build",*SERVICES',code)
        self.assertNotIn('"--force-recreate"',code)
        self.assertNotIn("mongorestore",code)
        self.assertNotIn("docker compose down",code)


if __name__=="__main__":
    unittest.main()
