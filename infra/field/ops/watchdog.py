#!/usr/bin/env python3
"""Site Mapper S06 service watchdog. Does not write to databases.

Recovery is DISABLED by default. Uses Docker Compose labels to target one
container only; never restarts MongoDB, TimescaleDB, or Docker daemon.
"""
from __future__ import annotations

import fcntl
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

HOST = os.getenv("S06_HOSTNAME", "sitemapper.thradex.home.arpa")
CA_FILE = Path(os.getenv("S06_CA_CERT", "/etc/site-mapper/ca-root.crt"))
APP_URL = "http://127.0.0.1:3000/api/health"
HTTPS_URL = f"https://{HOST}/api/health"
PROJECT = os.getenv("S06_COMPOSE_PROJECT", "appm-site-mapper")
STATE = Path(os.getenv("S06_WATCHDOG_STATE", "/var/lib/site-mapper/watchdog.json"))
LOCK = STATE.with_suffix(".lock")
RECOVERY = os.getenv("S06_WATCHDOG_RECOVERY_ENABLED", "0") == "1"
MAX_ATTEMPTS = 3
WINDOW = 900
THRESHOLD = 3
RECOVERABLE = {"site-mapper", "caddy"}
PROTECTED = {"mongodb", "timescaledb", "telemetry-store", "mongo-init"}


def log(event: str, **details: object) -> None:
    print(json.dumps({"ts": int(time.time()), "event": event, **details}, sort_keys=True), flush=True)


def run(*args: str, timeout: int = 15) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)


def probe(url: str, ctx: ssl.SSLContext | None = None) -> tuple[bool, str]:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "SiteMapper-S06-watchdog/1"})
        with urllib.request.urlopen(request, timeout=5, context=ctx) as response:
            return (response.status == 200, f"http_{response.status}")
    except urllib.error.HTTPError as exc:
        return False, f"http_{exc.code}"
    except (urllib.error.URLError, ssl.SSLError, OSError, TimeoutError) as exc:
        if isinstance(exc, urllib.error.URLError) and isinstance(exc.reason, ssl.SSLError):
            return False, "tls_invalid"
        if isinstance(exc, ssl.SSLError):
            return False, "tls_invalid"
        return False, type(exc).__name__


def container_for(service: str) -> str | None:
    result = run(
        "docker", "ps", "-aq",
        "--filter", f"label=com.docker.compose.project={PROJECT}",
        "--filter", f"label=com.docker.compose.service={service}",
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
        # A declared unhealthy healthcheck blocks web app recovery.
        health = run("docker", "inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}", cid)
        if health.returncode != 0 or health.stdout.strip() == "unhealthy":
            return service
    return None


def restart(service: str) -> bool:
    if service not in RECOVERABLE or service in PROTECTED:
        return False
    cid = container_for(service)
    if cid is None:
        return False
    current = run("docker", "inspect", "--format", "{{.State.Status}}", cid)
    if current.returncode != 0:
        return False
    # docker restart does not revive a container intentionally stopped by an operator.
    if current.stdout.strip() != "running":
        log("manual_or_stopped_container", service=service)
        return False
    changed = run("docker", "restart", "--time", "10", cid, timeout=40)
    log("recovery_attempt", service=service, success=changed.returncode == 0)
    return changed.returncode == 0


def load_state() -> dict:
    try:
        value = json.loads(STATE.read_text())
        if isinstance(value, dict):
            return value
    except (OSError, ValueError):
        pass
    return {"failures": {"caddy": 0, "site-mapper": 0}, "attempts": [], "lockout": False}


def save_state(data: dict) -> None:
    STATE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, sort_keys=True))
    os.chmod(tmp, 0o600)
    tmp.replace(STATE)


def main() -> int:
    STATE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOCK.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        data = load_state()
        now = int(time.time())
        data["attempts"] = [t for t in data.get("attempts", []) if isinstance(t, int) and now - WINDOW < t <= now]
        app_ok, app_reason = probe(APP_URL)
        if not CA_FILE.is_file():
            tls_ok, tls_reason = False, "ca_public_root_not_installed"
        else:
            try:
                ctx = ssl.create_default_context(cafile=str(CA_FILE))
                tls_ok, tls_reason = probe(HTTPS_URL, ctx)
            except (OSError, ssl.SSLError) as exc:
                tls_ok, tls_reason = False, type(exc).__name__

        # No action until local DNS and CA trust are configured.
        if tls_reason in ("ca_public_root_not_installed", "tls_invalid", "gaierror"):
            log("configuration_block", tls=tls_reason, app=app_reason)
            save_state(data)
            return 2

        if app_ok and tls_ok:
            data["failures"] = {"caddy": 0, "site-mapper": 0}
            # Deliberately do not clear LOCKOUT automatically.
            log("healthy", lockout=bool(data.get("lockout", False)))
            save_state(data)
            return 0

        target = "site-mapper" if not app_ok else "caddy"
        data.setdefault("failures", {}).setdefault(target, 0)
        data["failures"][target] += 1
        log("degraded", target=target, app=app_reason, https=tls_reason, consecutive=data["failures"][target])
        if data["failures"][target] < THRESHOLD:
            save_state(data)
            return 1

        if target == "site-mapper":
            dep = unhealthy_dependency()
            if dep:
                log("dependency_block", dependency=dep)
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
        data["failures"][target] = 0
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
