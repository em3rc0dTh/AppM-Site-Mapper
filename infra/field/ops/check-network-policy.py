#!/usr/bin/env python3
"""Validate S06 intended network policy; NEVER applies firewall rules."""
from __future__ import annotations
import ipaddress
import json
import pathlib
import sys


def main() -> int:
    path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "infra/field/ops/network-policy.example.json")
    data = json.loads(path.read_text())
    if data.get("mode") != "FIELD_LAN" or data.get("default_ingress") != "DENY":
        raise ValueError("invalid profile or ingress policy")
    if data.get("apply_automatically") is not False:
        raise ValueError("policy cannot auto-apply")
    for section in ("web", "management"):
        cidr = ipaddress.ip_network(data[section]["source_cidr"], strict=False)
        if cidr.prefixlen == 0 or not cidr.is_private:
            raise ValueError(f"{section} source is not an authorized private subnet")
    if data["web"]["port"] != 443 or data["management"]["port"] != 22:
        raise ValueError("unexpected ingress ports")
    if 3000 not in data["excluded_web_ports"] or 80 not in data["excluded_web_ports"]:
        raise ValueError("incomplete web deny contract")
    print(json.dumps({"policy": "VALIDATED_NOT_APPLIED", "firewall_changed": False}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"policy": "BLOCKED", "error_type": type(exc).__name__, "message": str(exc)}), file=sys.stderr)
        raise SystemExit(1)
