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

## Telemetry

### TELEMETRY_ENABLED

`true` starts the server-side MQTT source.

Default:

`false`

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

## Example

Use `.env.example` for variable names only.

Production secret values belong in the deployment platform's secret store, not Git.
