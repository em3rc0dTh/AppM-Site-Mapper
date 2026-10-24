"""Validate accepted historical Compose provenance without Docker access."""
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "scripts" / "telemetry" / "commission-bdfb-lab-modbus.py"
)
spec = importlib.util.spec_from_file_location("lab_modbus_commission", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ComposeProvenanceTest(unittest.TestCase):
    def get(self, service: str, count: int, *, project: str | None = None,
            working_dir: str | None = None, paths: list[str] | None = None):
        paths = paths or [str(x) for x in module.FILES[:count]]
        obj = {
            "State": {"Running": True},
            "Config": {"Labels": {
                "com.docker.compose.project": project or module.PROJECT,
                "com.docker.compose.service": service,
                "com.docker.compose.project.working_dir": working_dir or str(module.ROOT),
                "com.docker.compose.project.config_files": ",".join(paths),
            }},
        }
        with patch.dict(module.inspect.__globals__,
                        {"run": lambda args: json.dumps([obj])}):
            return module.inspect(f"{module.PROJECT}-{service}-1")

    def test_app_requires_three_exact_approved_files(self):
        self.assertIsNotNone(self.get("site-mapper", 3))
        for count in (1, 2):
            with self.assertRaisesRegex(RuntimeError, "Site Mapper must"):
                self.get("site-mapper", count)

    def test_bridge_accepts_approved_historical_prefixes(self):
        # Bridge can predate overlays; full volumes/env are checked at deploy.
        for count in (1, 2, 3):
            self.assertIsNotNone(self.get("modbus-tcp", count))

    def test_database_services_accept_safe_prefixes(self):
        for service in ("mongodb", "timescaledb"):
            for count in (1, 2, 3):
                self.assertIsNotNone(self.get(service, count))

    def test_rejects_other_checkout_or_extra_overlay(self):
        actual = [str(x) for x in module.FILES]
        for paths in (
            actual + ["/tmp/other-compose.yaml"],
            [actual[0], "/tmp/unapproved.yaml"],
            list(reversed(actual)),
        ):
            with self.assertRaisesRegex(RuntimeError, "unapproved Compose provenance"):
                self.get("modbus-tcp", 2, paths=paths)

    def test_rejects_other_compose_project_and_service(self):
        with self.assertRaisesRegex(RuntimeError, "another Compose project"):
            self.get("modbus-tcp", 2, project="unrelated")
        with self.assertRaisesRegex(RuntimeError, "working directory"):
            self.get("modbus-tcp", 2, working_dir="/tmp/not-original")


if __name__ == "__main__":
    unittest.main()
