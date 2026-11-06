#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / ".runtime" / "s05-local"
RUNTIME.mkdir(parents=True, exist_ok=True)

command = [
    "docker", "compose",
    "--project-name", "site-mapper-s05-local",
    "--env-file", str(ROOT / "infra/integration/integration.env"),
    "-f", str(ROOT / "docker-compose.telemetry.yml"),
    "-f", str(ROOT / "docker-compose.integration.yml"),
    "config", "--format", "json",
]
raw = subprocess.check_output(command, cwd=ROOT, text=True)
config = json.loads(raw)

for service in config.get("services", {}).values():
    service.pop("ports", None)
    service.pop("container_name", None)

config["name"] = "site-mapper-s05-local"
target = RUNTIME / "compose.json"
target.write_text(json.dumps(config, indent=2) + "\n", encoding="utf8")
print(target)
