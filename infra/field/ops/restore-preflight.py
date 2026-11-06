#!/usr/bin/env python3
"""Verify encrypted S06 backup and extract to a NEW isolated directory.

This tool intentionally NEVER connects to or modifies live databases.
Actual mongorestore/pg_restore are manual, approved operations in an isolated
target after reviewing the extracted data and its identity.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--isolated-output", required=True, type=Path)
    parser.add_argument("--identity", required=True, type=Path, help="age private identity on authorized recovery workstation")
    args = parser.parse_args()
    bundle = args.bundle.resolve()
    target = args.isolated_output.resolve()
    manifest = json.loads((bundle / "manifest.json").read_text())
    if (bundle / "INCOMPLETE").exists():
        raise RuntimeError("incomplete backup: refusing restore")
    if manifest.get("schema") != 1 or manifest.get("encryption") != "age":
        raise RuntimeError("unsupported backup manifest")
    if not manifest.get("files"):
        raise RuntimeError("empty manifest")
    if target.exists():
        raise RuntimeError("isolated output already exists: refusing overwrite")
    # Prevent writing back into the live repository or mounted Docker data trees.
    if str(target).startswith(str(Path.cwd().resolve()) + os.sep):
        raise RuntimeError("choose an isolated output outside the working repository")
    for name, record in manifest["files"].items():
        if Path(name).name != name or not name.endswith(".age"):
            raise RuntimeError("invalid archive filename")
        file = bundle / name
        if not file.is_file() or sha256(file) != record.get("sha256"):
            raise RuntimeError(f"ciphertext integrity check failed: {name}")
    target.mkdir(mode=0o700, parents=False)
    try:
        for name in manifest["files"]:
            decrypted = target / name.removesuffix(".age")
            with decrypted.open("wb") as output:
                subprocess.run(["age", "-d", "-i", str(args.identity), str(bundle / name)],
                               stdout=output, check=True, timeout=1200)
            os.chmod(decrypted, 0o600)
        print(json.dumps({"status": "verified_and_decrypted_to_isolated_directory",
                          "path": str(target), "live_services_modified": False}))
        return 0
    except Exception:
        (target / "INCOMPLETE").write_text("Decryption incomplete; do not restore.\n")
        raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "restore_preflight_failed", "error_type": type(exc).__name__,
                          "error": str(exc)}), file=sys.stderr)
        raise SystemExit(1)
