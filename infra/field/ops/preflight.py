#!/usr/bin/env python3
"""Read-only preflight. Prints no environment variable values or secrets."""
from __future__ import annotations
import ipaddress
import json
import shutil
import socket
import subprocess

HOST = "sitemapper.thradex.home.arpa"


def result(name: str, status: str, note: str = "") -> None:
    print(json.dumps({"check": name, "status": status, "note": note}))


def main() -> int:
    try:
        addresses = sorted({r[4][0] for r in socket.getaddrinfo(HOST, 443, type=socket.SOCK_STREAM)})
        valid = all(ipaddress.ip_address(ip).is_private for ip in addresses)
        result("dns_local_private", "PASS" if valid else "BLOCK", f"{len(addresses)} addresses")
    except OSError:
        result("dns_local_private", "BLOCK", "hostname not resolved")
    for tool in ("docker", "age", "python3"):
        result(f"tool_{tool}", "PASS" if shutil.which(tool) else "BLOCK")
    if not shutil.which("docker"):
        return 1
    p = subprocess.run(["docker", "ps", "--format", "{{.Names}}\t{{.Ports}}"],
                       capture_output=True, text=True, timeout=20)
    if p.returncode:
        result("docker_access", "BLOCK", "Docker unavailable or insufficient permissions")
        return 1
    result("docker_access", "PASS")
    for line in p.stdout.splitlines():
        name, _, ports = line.partition("\t")
        if any(p in ports for p in ("3000", "443", "1883", "27017", "55432", "3100", "1503")):
            result("review_published_ports", "REVIEW", f"container={name} ports={ports}")
    result("deployment", "NOT_EXECUTED", "preflight does not modify host")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        result("preflight", "BLOCK", type(exc).__name__)
        raise SystemExit(1)
