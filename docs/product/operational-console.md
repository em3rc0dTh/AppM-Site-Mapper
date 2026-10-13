# Site Mapper Operational Console — MK0/MK1

An independent, lightweight operational HTTP service supplied with the Site Mapper Docker Compose stack. Default local URL: `http://127.0.0.1:3100`. It is **not** a second spatial editor.

## Supported consultation

- **Inventory**: Network, Site, Structure, Level, Room, Bay, Position, Rack/Container, Device, Equipment and nested Equipment in a flat, searchable table. Includes immediate parent, child count, lineage, Network/Site/Level/Rack, serial, equipment type and number of AccessPorts.
- **Power**: one row per active PowerPath with actual AccessPort IDs, feed and resolved source/target Equipment. Cross-Device connections are supported and displayed from the same persisted power paths as Site Mapper.
- **Bindings**: explicit active MQTT source, raw point, metric, exact Equipment target and lifecycle.
- **Telemetry**: read-only independently subscribed MQTT BFDB telemetry, but **only after verifying active publisher identity, exact source-point-to-breaker metric binding and active breaker**. Mark LIVE only within 30 seconds. When MQTT LIVE is unavailable, retrieve the last historical accepted samples from **Site Mapper TimescaleDB**, clearly labelled RECENT_HISTORICAL or STALE_HISTORICAL; never pretend historical data is LIVE.
- Export per-view CSV. Fields that begin with common spreadsheet formula introducers are escaped to avoid formula evaluation on import.
- All reads are from separate MongoDB/TimescaleDB connections or this service's own MQTT subscription, **not** the Next.js frontend or API. A previously authenticated console session can still read while Next.js is offline.

## Supported creation

The console uses **Site Mapper's validated server APIs** for writes, with the authenticated actor's original session and normal domain permissions. For consistency with Blueprint, writes currently require the Next.js API to be available:

- Network
- Level (e.g. name `Level -1` within a pre-existing Structure; the current schema has no canonical signed level index)
- Position with a discrete `coordinate: {"row":"A","column":1}`
- Container/Rack in an existing suitable parent
- Device and Equipment (hierarchy, types, and positional attributes are validated by the application)
- AccessPort on an existing Equipment
- PowerPath between exact AccessPort IDs of different Equipment (and Devices)
- Telemetry commissioning via the existing explicitly confirmed binding endpoint

**Not creatable:** Site, Structure, Room/Substructure and Cluster/Bay because those require Blueprint polygon geometry. Extra fields must never supply a polygon or override this restriction.

Writes are available only to ADMIN/SUPERADMIN and still pass the main application's RBAC and validation. STANDARD accounts can consult/export only.

The first release intentionally does **not** duplicate topology/power domain services inside the console. If Next.js is down, existing authenticated operators can still inspect inventory, connections and independent MQTT LIVE, but they must wait for the application API to return before submitting mutations. Independent write operations can follow after the domain is factored into a shared process-safe package.

## Deployment

The `docker-compose.telemetry.yml` stack contains `operational-console`, alongside the existing TimescaleDB telemetry-store and Modbus sidecar.

Configure:

```sh
MONGODB_URI=mongodb://<reachable-host>:27017/
MONGODB_DB_NAME=appm_site_mapper
SITE_MAPPER_API_URL=http://host.docker.internal:3000
MQTT_BROKER_URL=mqtt://<reachable-broker>:1883
MQTT_USERNAME=<username-if-applicable>
MQTT_PASSWORD=<password-if-applicable>
```

Start with `docker compose -f docker-compose.telemetry.yml up -d --build operational-console`. On the host, open `http://127.0.0.1:3100`. Container networking differs from host `localhost`; use a resolvable service name or gateway address for Mongo/MQTT in Docker. In production use an authenticated `mqtts://` broker and protect console HTTP with an authorized HTTPS reverse proxy.

**Security:** port 3100 binds to the host loopback by default. Never expose to a public interface without TLS/reverse proxy and network restrictions. Console session lifetime is 1h; in-memory sessions are invalidated by restarting the console. A Site Mapper account must authenticate while the application API is available.

## Tests

```sh
cd infra/operational-console
npm install
npm test
```

The GitHub workflow additionally builds the production Docker image and checks authentication, tabular navigation, CSV export, spatial creation rejection, origin validation and independent MQTT commissioning filters.

## Limitations / release gates

- This is an operational fallback, not an independent second source of truth or a replacement for Blueprint.
- Historical telemetry is read from TimescaleDB; if both the MQTT broker and TimescaleDB are offline, no credible telemetry reading is presented.
- Database queries cap results at 5,000 records per view; pagination is required for larger deployments.
- Production rollout requires site-specific networking, TLS, backups, audit-event verification, workload limits and a real data end-to-end test on the target infrastructure.
- Password changes, user suspension or session revocation during a cached console session currently become effective after the console's 1-hour session expires (or process restart); deploy behind private access boundaries until shared revocation is implemented.
