#!/usr/bin/env python3
"""Offline static contract checker for S06 artifacts; never executes deployment."""
from __future__ import annotations
import ast
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PY = [
    "infra/field/ops/watchdog.py", "infra/field/ops/backup.py",
    "infra/field/ops/restore-preflight.py", "infra/field/ops/preflight.py",
    "infra/field/ops/check-network-policy.py",
]
FILES = [
    "docker-compose.field-lan.yml", "docker-compose.lab-remote.yml",
    "infra/field/caddy/Caddyfile", "infra/field/ops/field-lan-service.sh",
    "infra/field/ops/systemd/site-mapper-field-lan.service",
    "infra/field/ops/systemd/site-mapper-watchdog.service",
    "infra/field/ops/systemd/site-mapper-watchdog.timer",
    "infra/field/ops/systemd/site-mapper-backup.service",
    "infra/field/ops/systemd/site-mapper-backup.timer",
    "infra/field/ops/s06.env.example",
    "infra/field/ops/network-policy.example.json",
]
def main() -> int:
    for name in PY:
        ast.parse((ROOT / name).read_text(), filename=name)
    for name in FILES:
        if not (ROOT / name).is_file():
            raise RuntimeError("missing S06 artifact: " + name)
    caddy = (ROOT / "infra/field/caddy/Caddyfile").read_text()
    field = (ROOT / "docker-compose.field-lan.yml").read_text()
    remote = (ROOT / "docker-compose.lab-remote.yml").read_text()
    watchdog = (ROOT / "infra/field/ops/watchdog.py").read_text()
    assert "tls internal" in caddy and "sitemapper.thradex.home.arpa" in caddy
    assert "127.0.0.1:3000" in caddy
    assert "profiles: [\"field-lan\"]" in field and "network_mode: host" in field
    assert "profiles: [\"lab-remote\"]" in remote
    assert "S06_WATCHDOG_RECOVERY_ENABLED" in watchdog
    assert "PROTECTED" in watchdog and "LOCKOUT".lower() in watchdog.lower()
    assert "down -v" not in (ROOT / "infra/field/ops/field-lan-service.sh").read_text()
    print("S06 static contracts: OK (not a runtime certification)")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("S06 static contracts: FAILED -", str(exc), file=sys.stderr)
        raise SystemExit(1)
