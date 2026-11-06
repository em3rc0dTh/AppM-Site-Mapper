#!/usr/bin/env python3
"""Encrypted, engine-consistent S06 backup; never removes database volumes.

Requires age and Docker on the target host. Does not auto-install anything.
Uses mongodump and pg_dump executed inside the running database containers.
Encrypts every archive before it reaches its final destination.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone

PROJECT = os.getenv("S06_COMPOSE_PROJECT", "appm-site-mapper")
DEST = Path(os.getenv("S06_BACKUP_DEST", "/var/backups/site-mapper"))
RECIPIENT = os.getenv("S06_AGE_RECIPIENT", "")
RUNTIME_ENV = Path(os.getenv("S06_RUNTIME_ENV", ".runtime/office-test.env"))
CONFIGS = [
    Path("docker-compose.telemetry.yml"), Path("docker-compose.office-test.yml"),
    Path("docker-compose.field-lan.yml"), Path("docker-compose.lab-remote.yml"),
    Path("infra/field/caddy/Caddyfile"),
]


def execute(*cmd: str, stdout=None, timeout: int = 1800) -> None:
    subprocess.run(cmd, stdout=stdout, timeout=timeout, check=True)


def container(service: str) -> str:
    result = subprocess.run(
        ["docker", "ps", "-q", "--filter", f"label=com.docker.compose.project={PROJECT}",
         "--filter", f"label=com.docker.compose.service={service}"],
        capture_output=True, text=True, check=True, timeout=20,
    )
    ids = result.stdout.split()
    if len(ids) != 1:
        raise RuntimeError(f"expected one running {service} container; got {len(ids)}")
    return ids[0]


def digest(file: Path) -> str:
    h = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    if not RECIPIENT or RECIPIENT.startswith("CHANGE_ME"):
        raise RuntimeError("S06_AGE_RECIPIENT must be an approved public recipient")
    if shutil.which("age") is None:
        raise RuntimeError("age CLI is required; refusing plaintext backup")
    if shutil.which("docker") is None:
        raise RuntimeError("Docker CLI is unavailable")
    if not RUNTIME_ENV.is_file():
        raise RuntimeError("runtime env missing: do not regenerate it")
    for path in CONFIGS:
        if not path.is_file():
            raise RuntimeError(f"missing config {path}")
    DEST.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(DEST, 0o700)
    lock_path = DEST / ".backup.lock"
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bundle = DEST / f"s06-{stamp}"
        if bundle.exists():
            raise RuntimeError("backup destination exists; refusing overwrite")
        bundle.mkdir(mode=0o700)
        try:
            with tempfile.TemporaryDirectory(prefix="s06-", dir=DEST) as temp:
                workspace = Path(temp)
                os.chmod(workspace, 0o700)
                mongo = container("mongodb")
                timescale = container("timescaledb")
                caddy = container("caddy")

                with (workspace / "mongo.archive.gz").open("wb") as output:
                    execute("docker", "exec", mongo, "mongodump", "--archive", "--gzip", stdout=output)
                with (workspace / "timescale.dump").open("wb") as output:
                    execute("docker", "exec", timescale, "sh", "-ec",
                            'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
                            stdout=output)

                # Docker copy works without exposing CA private material to stdout.
                execute("docker", "cp", f"{caddy}:/data", str(workspace / "caddy-data"))
                with tarfile.open(workspace / "caddy-data.tar.gz", "w:gz") as archive:
                    archive.add(workspace / "caddy-data", arcname="caddy-data")

                with tarfile.open(workspace / "runtime-config.tar.gz", "w:gz") as archive:
                    archive.add(RUNTIME_ENV, arcname="runtime/office-test.env")
                    for path in CONFIGS:
                        archive.add(path, arcname=str(path))

                encrypted = {}
                for name in ("mongo.archive.gz", "timescale.dump", "caddy-data.tar.gz", "runtime-config.tar.gz"):
                    plaintext = workspace / name
                    ciphertext = bundle / f"{name}.age"
                    execute("age", "-r", RECIPIENT, "-o", str(ciphertext), str(plaintext))
                    os.chmod(ciphertext, 0o600)
                    encrypted[ciphertext.name] = {"sha256": digest(ciphertext), "bytes": ciphertext.stat().st_size}
                    plaintext.unlink()

                manifest = {
                    "schema": 1, "created_utc": stamp, "compose_project": PROJECT,
                    "encryption": "age", "files": encrypted,
                    "restore": "isolated-target-only; see restore-preflight.py and runbook",
                }
                (bundle / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
                os.chmod(bundle / "manifest.json", 0o600)
            print(json.dumps({"status": "encrypted_backup_complete", "location": str(bundle)}))
            return 0
        except Exception:
            # Never advertise incomplete backups as valid. Preserve files for incident forensics.
            (bundle / "INCOMPLETE").write_text("Backup did not complete. Do not restore this bundle.\n")
            raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__, "error": str(exc)}), file=sys.stderr)
        raise SystemExit(1)
