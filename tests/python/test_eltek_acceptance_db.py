import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "telemetry" / "accept-eltek-rich-lab.py"
SPEC = importlib.util.spec_from_file_location("accept_eltek_rich_lab", SCRIPT)
acceptance = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(acceptance)


class EltekAcceptanceMongoDbTests(unittest.TestCase):
    def test_uses_selected_mongo_database(self):
        script = acceptance.mongo_script("seed-01")
        self.assertIn('getSiblingDB("seed-01")', script)
        self.assertNotIn("appm_site_mapper", script)

    def test_rejects_unsafe_database_name(self):
        with self.assertRaises(ValueError):
            acceptance.mongo_script("seed-01'); db.dropDatabase(); //")


if __name__ == "__main__":
    unittest.main()
