import copy
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
loader=importlib.machinery.SourceFileLoader("tfarmctl",str(ROOT/"tfarmctl"))
spec=importlib.util.spec_from_loader(loader.name,loader)
kit=importlib.util.module_from_spec(spec)
loader.exec_module(kit)

class Contract(unittest.TestCase):
    def setUp(self):
        self.p=json.loads((ROOT/"profiles/tfarm.example.json").read_text())
        self.p["network"]["wan"]="wlan0"
        self.p["network"]["lan"]=["eth1","eth2"]
    def load(self,p):
        with tempfile.TemporaryDirectory() as d:
            f=Path(d)/"profile.json";f.write_text(json.dumps(p))
            return kit.load_profile(f)
    def test_portable(self):
        p=self.load(self.p)
        commands=kit.network_plan(p)
        self.assertIn("eth1",commands[1])
        self.assertIn("eth2",commands[2])
        self.assertNotIn("wlan0",str(commands))
    def test_unassigned_roles(self):
        self.p["network"]["wan"]="SELECT_WAN"
        with self.assertRaises(ValueError): self.load(self.p)
    def test_wan_conflict(self):
        self.p["network"]["lan"]=["wlan0"]
        with self.assertRaises(ValueError): self.load(self.p)
    def test_pool_overlap(self):
        self.p["network"]["dhcp"]["poolStart"]="192.168.10.1"
        with self.assertRaises(ValueError): self.load(self.p)
    def test_dhcp(self):
        d=kit.dhcp_config(self.load(self.p))["Dhcp4"]
        self.assertEqual(d["valid-lifetime"],2592000)
        self.assertEqual(d["subnet4"][0]["subnet"],"192.168.10.0/24")
    def test_service_guard(self):
        self.p["services"].append("snmp-trap-test")
        with self.assertRaises(ValueError): self.load(self.p)
    def test_tfarm_overlay_reasserts_site_mapper_restart(self):
        text=(ROOT/"compose.tfarm.yml").read_text()
        self.assertIn("site-mapper:",text)
        self.assertIn("restart: unless-stopped",text)
    def test_bootstrap_installs_local_dns_runtime(self):
        text=(ROOT/"bootstrap-host.sh").read_text()
        self.assertIn("dnsmasq-base",text)
        self.assertIn("systemctl enable --now docker",text)
    def test_extra_bundle_member(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d); (d/"manifest.json").write_text(json.dumps({"schemaVersion":1,"files":{}}))
            (d/"unexpected").write_text("unexpected")
            with self.assertRaises(ValueError): kit.verify_directory(d)
    def test_incomplete_recovery_bundle(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d); (d/"manifest.json").write_text(json.dumps({"schemaVersion":1,"files":{}}))
            with self.assertRaises(ValueError): kit.verify_bundle(d)
    def test_integrity(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d); f=d/"file"; f.write_text("original")
            (d/"manifest.json").write_text(json.dumps({"schemaVersion":1,"files":{"file":kit.digest(f)}}))
            kit.verify_directory(d)
            f.write_text("changed")
            with self.assertRaises(ValueError): kit.verify_directory(d)

if __name__=="__main__": unittest.main()