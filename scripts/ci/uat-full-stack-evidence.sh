#!/usr/bin/env bash
# Only the self-contained synthetic integration profile. Never use FIELD volumes.
set -euo pipefail
[[ "${1:-}" == --isolated-lab ]] || { echo 'Require --isolated-lab'; exit 64; }
[[ "${COMPOSE_PROJECT_NAME:-}" =~ ^uat-[a-zA-Z0-9-]+$ ]] || { echo 'Require a dedicated uat-* Compose project'; exit 64; }
cd "$(dirname "$0")/../.."
dc() {
  docker compose --env-file infra/integration/integration.env \
    -f docker-compose.telemetry.yml -f docker-compose.integration.yml "$@"
}
mkdir -p artifacts/uat-lab
exec > >(tee artifacts/uat-lab/recovery.log) 2>&1
date -u +%FT%TZ
git rev-parse HEAD > artifacts/uat-lab/checkout-sha.txt
git status --porcelain > artifacts/uat-lab/working-tree.txt
dc config --services > artifacts/uat-lab/services.txt
! grep -qx operational-console artifacts/uat-lab/services.txt
dc ps --format json > artifacts/uat-lab/services-before.json
for id in $(dc ps -q); do
  docker inspect --format '{{.Name}} image={{.Image}} started={{.State.StartedAt}}' "$id"
done > artifacts/uat-lab/container-images.txt

mongo_count() { dc exec -T mongodb mongosh --quiet seed-01 --eval 'db.topology_nodes.countDocuments({})' | tail -n 1; }
sql_count() { dc exec -T timescaledb psql -X -U site_mapper -d site_mapper_telemetry -Atqc 'SELECT count(*) FROM telemetry_samples;'; }
before_mongo=$(mongo_count)
before_sql=$(sql_count)
[[ "$before_mongo" -gt 0 && "$before_sql" -gt 0 ]]
old_started=$(docker inspect -f '{{.State.StartedAt}}' "$(dc ps -q site-mapper)")
dc restart site-mapper
for attempt in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:3000/api/health > artifacts/uat-lab/health-after-restart.json; then break; fi
  [[ "$attempt" -lt 90 ]] || exit 1
  sleep 2
done
new_started=$(docker inspect -f '{{.State.StartedAt}}' "$(dc ps -q site-mapper)")
[[ "$old_started" != "$new_started" ]]
[[ "$(mongo_count)" == "$before_mongo" ]]
[[ "$(sql_count)" -ge "$before_sql" ]]
echo "APPLICATION_RESTART_OK topology=$before_mongo history_before=$before_sql"

# Quiesce synthetic writers for an internally consistent LAB database snapshot.
dc stop site-mapper mqtt-publisher snmp-collector-qdf2 snmp-collector-qdf4 snmp-collector-qdf5 snmp-trap-sender snmp-traps telemetry-store
backup_dir=$(mktemp -d)
trap 'rm -rf "$backup_dir"' EXIT
dc exec -T mongodb mongodump --quiet --db seed-01 --archive --gzip > "$backup_dir/mongodb.archive.gz"
dc exec -T timescaledb pg_dump -U site_mapper -d site_mapper_telemetry -Fc > "$backup_dir/timescale.dump"
expected_mongo=$(mongo_count)
expected_sql=$(sql_count)
timescale_image=$(docker inspect -f '{{.Image}}' "$(dc ps -q timescaledb)")
timescale_version=$(dc exec -T timescaledb psql -X -U site_mapper -d site_mapper_telemetry -Atqc "SELECT extversion FROM pg_extension WHERE extname='timescaledb';")
printf 'mongoDatabase=seed-01\ntimescaleImage=%s\ntimescaleVersion=%s\n' "$timescale_image" "$timescale_version" > "$backup_dir/MANIFEST.txt"
(cd "$backup_dir" && sha256sum mongodb.archive.gz timescale.dump MANIFEST.txt > SHA256SUMS)
sh scripts/operations/verify-isolated-backup-restore.sh "$backup_dir" | tee artifacts/uat-lab/restore.log
grep -qx "mongoTopologyNodes=$expected_mongo" artifacts/uat-lab/restore.log
grep -qx "timescaleTelemetrySamples=$expected_sql" artifacts/uat-lab/restore.log
echo "BACKUP_RESTORE_COUNT_PARITY_OK topology=$expected_mongo history=$expected_sql"
# Dumps, runtime environment and credentials are deliberately not uploaded.
dc start telemetry-store site-mapper mqtt-publisher snmp-collector-qdf2 snmp-collector-qdf4 snmp-collector-qdf5 snmp-traps snmp-trap-sender
for attempt in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:3000/api/health > artifacts/uat-lab/health-final.json; then break; fi
  [[ "$attempt" -lt 90 ]] || exit 1
  sleep 2
done
dc ps --format json > artifacts/uat-lab/services-final.json
echo 'UAT_LAB_RECOVERY_EVIDENCE_OK (not host reboot, MFA-key recovery, FIELD or customer sign-off)'
