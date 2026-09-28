# Environment Reference

## Supported environments

`APP_ENV` accepts:

- `development`
- `test`
- `staging`
- `production`

## Application persistence

### APP_PERSISTENCE

Allowed values:

- `memory`
- `mongodb`

Default behavior:

- production defaults to MongoDB;
- non-production defaults to memory.

`APP_PERSISTENCE=memory` is explicitly rejected in production.

### MONGODB_URI

Required runtime secret when MongoDB persistence is active.

Never commit a real URI.

### MONGODB_DB_NAME

MongoDB database name.

Default:

`appm_site_mapper`

## Identity bootstrap

### BOOTSTRAP_ADMIN_TOKEN

Runtime-only secret protecting the one-time first Superadmin bootstrap endpoint.

The bootstrap use case closes after the first user exists.

Rotate or remove access to the bootstrap secret after first-user initialization according to the deployment platform's secret-management procedure.

## Telemetry / MQTT data provider

### TELEMETRY_ENABLED

`true` starts the server-side MQTT consumer.

Default:

`false`

AppM consumes an already-running MQTT provider. It does not start the BFDB emulator or broker.

### TELEMETRY_MAX_STREAMS

Maximum in-process browser SSE subscribers.

Default:

`100`

### TELEMETRY_MAX_PAYLOAD_BYTES

Maximum accepted telemetry payload.

Default:

`262144`

### MQTT_BROKER_URL

Required runtime secret/config when telemetry is enabled.

Supported transport schemes:

- `mqtt://`
- `mqtts://`

Examples are intentionally omitted from committed configuration because the active provider endpoint is runtime data.

### MQTT_USERNAME / MQTT_PASSWORD

Optional broker credentials depending on broker configuration.

Never expose them to browser code or commit them.

### MQTT_TOPIC_PREFIX

External telemetry identity prefix.

Default:

`data/dev/`

### MQTT_TOPIC_FILTER

Broker subscription filter.

Default is derived from the topic prefix and normally resolves to:

`data/dev/#`

### MQTT_SOURCE_DEVICE_MAP

Optional JSON object mapping an external MQTT source identity to an existing AppM Device ID.

Use it when the emulator/provider serial differs from the `serialNumber` stored in MongoDB.

Example shape:

```json
{ "EMU-BFDB-01": "<appm-device-id>" }
```

Do not put customer data or secrets in the committed `.env.example`.

### BFDB_TELEMETRY_BINDING_MODE

Allowed values:

- `panel-order-24` — default emulator mapping using stored BDFB panel order and endpoint position;
- `explicit` — only `breaker.telemetry.rawPointId` bindings are accepted.

Default:

`panel-order-24`

### BFDB_POSITIONS_PER_PANEL

Panel position boundary for the panel-order resolver.

Default:

`24`

## Provider replacement

A future provider change should normally be performed by changing runtime MQTT endpoint/configuration, not by copying provider implementation into AppM.

If the future provider changes the wire contract rather than only the endpoint/credentials, that change requires a new telemetry adapter/contract review.

## Example

Use `.env.example` for variable names only.

Production secret values belong in the deployment platform's secret store, not Git.
