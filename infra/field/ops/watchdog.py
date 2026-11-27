#!/usr/bin/env python3
"""Site Mapper S06 selective service watchdog.

The watchdog never writes application databases and never restarts Docker,
MongoDB, TimescaleDB, telemetry-store, or other industrial services.
"""
from __future__ import annotations

import fcntl
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import time
import urllib.error
import urllib.request

HOST = os.getenv("S06_HOSTNAME", "sitemapper.thradex.home.arpa")
EXPECTED_IP = os.getenv("S06_EXPECTED_IP", "192.168.10.1").strip()
CA_FILE_TEXT = os.getenv("S06_CA_CERT", "").strip()
CA_FILE = Path(CA_FILE_TEXT) if CA_FILE_TEXT else None
APP_URL = "http://127.0.0.1:3000/api/health"
HTTPS_URL = f"https://{HOST}/api/health"
PROJECT = os.getenv("S06_COMPOSE_PROJECT", "appm-site-mapper")
STATE = Path(os.getenv("S06_WATCHDOG_STATE", "/var/lib/site-mapper/watchdog.json"))
LOCK = STATE.with_suffix(".lock")
RECOVERY = os.getenv("S06_WATCHDOG_RECOVERY_ENABLED", "0") == "1"
CADDY_MODE = os.getenv("S06_CADDY_MODE", "systemd")
CADDY_UNIT = os.getenv("S06_CADDY_SYSTEMD_UNIT", "caddy.service")
DNS_UNIT = os.getenv("S06_DNS_SYSTEMD_UNIT", "site-mapper-dns.service")
MAX_ATTEMPTS = 3
WINDOW = 900
THRESHOLD = 3
TARGETS = ("dns", "site-mapper", "caddy")
PROTECTED = {"mongodb", "timescaledb", "telemetry-store", "mongo-init"}


def log(event: str, **details: object) -> None:
    print(json.dumps({"ts": int(time.time()), "event": event, **details}, sort_keys=True), flush=True)


def run(*args: str, timeout: int = 15) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)


def probe(url: str, ctx: ssl.SSLContext | None = None) -> tuple[bool, str]:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "SiteMapper-S06-watchdog/2"})
        with urllib.request.urlopen(request, timeout=5, context=ctx) as response:
            return response.status == 200, f"http_{response.status}"
    except urllib.error.HTTPError as exc:
        return False, f"http_{exc.code}"
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, ssl.SSLError):
            return False, "tls_invalid"
        if isinstance(exc.reason, socket.gaierror):
            return False, "dns_unavailable"
        return False, type(exc.reason).__name__
    except (ssl.SSLError, OSError, TimeoutError) as exc:
        if isinstance(exc, ssl.SSLError):
            return False, "tls_invalid"
        return False, type(exc).__name__


def resolve_host() -> tuple[bool, str]:
    try:
        rows = socket.getaddrinfo(HOST, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False, "dns_unavailable"
    addresses = {row[4][0] for row in rows if row[4]}
    if not addresses:
        return False, "dns_empty"
    if EXPECTED_IP and EXPECTED_IP not in addresses:
        return False, "dns_wrong_address"
    return True, "dns_ok"


def container_for(service: str) -> str | None:
    result = run(
        "docker",
        "ps",
        "-aq",
        "--filter",
        f"label=com.docker.compose.project={PROJECT}",
        "--filter",
        f"label=com.docker.compose.service={service}",
    )
    if result.returncode:
        log("docker_lookup_failed", service=service, reason=result.stderr[-200:])
        return None
    ids = result.stdout.split()
    return ids[0] if len(ids) == 1 else None


def unhealthy_dependency() -> str | None:
    for service in ("mongodb", "timescaledb", "telemetry-store"):
        cid = container_for(service)
        if cid is None:
            return service
        status = run("docker", "inspect", "--format", "{{.State.Status}}", cid)
        if status.returncode != 0 or status.stdout.strip() != "running":
            return service
        health = run(
            "docker",
            "inspect",
            "--format",
            "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
            cid,
        )
        if health.returncode != 0 or health.stdout.strip() == "unhealthy":
            return service
    return None


def restart_running_container(service: str) -> bool:
    if service in PROTECTED:
        return False
    cid = container_for(service)
    if cid is None:
        return False
    current = run("docker", "inspect", "--format", "{{.State.Status}}", cid)
    if current.returncode != 0:
        return False
    # Restart policy owns crash recovery. Do not revive an intentionally stopped container.
    if current.stdout.strip() != "running":
        log("manual_or_stopped_container", service=service)
        return False
    changed = run("docker", "restart", "--time", "10", cid, timeout=40)
    log("recovery_attempt", target=service, mechanism="docker_restart", success=changed.returncode == 0)
    return changed.returncode == 0


def restart_active_unit(unit: str, target: str) -> bool:
    active = run("systemctl", "is-active", "--quiet", unit)
    # Preserve an intentional operator stop. systemd Restart=on-failure handles crashes.
    if active.returncode != 0:
        log("manual_or_stopped_unit", target=target, unit=unit)
        return False
    changed = run("systemctl", "restart", unit, timeout=40)
    log("recovery_attempt", target=target, mechanism="systemd_restart", success=changed.returncode == 0)
    return changed.returncode == 0


def restart(target: str) -> bool:
    if target == "site-mapper":
        return restart_running_container("site-mapper")
    if target == "dns":
        return restart_active_unit(DNS_UNIT, "dns")
    if target == "caddy":
        if CADDY_MODE == "systemd":
            return restart_active_unit(CADDY_UNIT, "caddy")
        if CADDY_MODE == "compose":
            return restart_running_container("caddy")
        log("invalid_caddy_mode", value=CADDY_MODE)
    return False


def load_state() -> dict:
    try:
        value = json.loads(STATE.read_text())
        if isinstance(value, dict):
            return value
    except (OSError, ValueError):
        pass
    return {"failures": {target: 0 for target in TARGETS}, "attempts": [], "lockout": False}


def save_state(data: dict) -> None:
    STATE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, sort_keys=True))
    os.chmod(tmp, 0o600)
    tmp.replace(STATE)


def tls_context() -> tuple[ssl.SSLContext | None, str | None]:
    if CA_FILE is None:
        return ssl.create_default_context(), None
    if not CA_FILE.is_file():
        return None, "configured_ca_missing"
    try:
        return ssl.create_default_context(cafile=str(CA_FILE)), None
    except (OSError, ssl.SSLError) as exc:
        return None, type(exc).__name__


def main() -> int:
    STATE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOCK.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        data = load_state()
        now = int(time.time())
        data["attempts"] = [
            t for t in data.get("attempts", []) if isinstance(t, int) and now - WINDOW < t <= now
        ]
        failures = data.setdefault("failures", {})
        for target in TARGETS:
            failures.setdefault(target, 0)

        app_ok, app_reason = probe(APP_URL)
        dns_ok, dns_reason = resolve_host()
        ctx, ctx_error = tls_context()
        if ctx_error:
            log("configuration_block", tls=ctx_error, dns=dns_reason, app=app_reason)
            save_state(data)
            return 2
        if dns_ok:
            tls_ok, tls_reason = probe(HTTPS_URL, ctx)
        else:
            tls_ok, tls_reason = False, dns_reason

        if app_ok and dns_ok and tls_ok:
            data["failures"] = {target: 0 for target in TARGETS}
            log("healthy", lockout=bool(data.get("lockout", False)))
            save_state(data)
            return 0

        target = "site-mapper" if not app_ok else ("dns" if not dns_ok else "caddy")
        failures[target] += 1
        log(
            "degraded",
            target=target,
            app=app_reason,
            dns=dns_reason,
            https=tls_reason,
            consecutive=failures[target],
        )
        if failures[target] < THRESHOLD:
            save_state(data)
            return 1

        if target == "site-mapper":
            dependency = unhealthy_dependency()
            if dependency:
                log("dependency_block", dependency=dependency)
                save_state(data)
                return 2

        if data.get("lockout") or len(data["attempts"]) >= MAX_ATTEMPTS:
            data["lockout"] = True
            log("lockout", target=target, recent_attempts=len(data["attempts"]))
            save_state(data)
            return 3

        if not RECOVERY:
            log("recovery_disabled", target=target)
            save_state(data)
            return 1

        data["attempts"].append(now)
        failures[target] = 0
        ok = restart(target)
        if not ok:
            log("manual_attention_required", target=target)
        save_state(data)
        return 0 if ok else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BlockingIOError:
        log("already_running")
        raise SystemExit(0)
    except Exception as exc:
        log("watchdog_error", kind=type(exc).__name__)
        raise SystemExit(2)