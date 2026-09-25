# G16 Mosquitto reference boundary

This directory is an executable **reference policy**, not a bundle of production secrets.

The profile is certified in CI against Eclipse Mosquitto 2.1.2. CI resolves the official `2.1.2-alpine` release to an immutable image digest and uses that digest by default. The repository intentionally does
not contain password files, private keys or production certificates.

## Security properties

- only TLS listener 8883 is configured;
- anonymous access is disabled;
- MQTT 3.1.1 and MQTT 5 are accepted; MQTT 3.1 is excluded;
- broker publish QoS is capped at QoS 1 for this boundary;
- payload/packet, inflight and queue limits are explicit;
- each hardware publisher username maps to exactly one source namespace through `%u`;
- the Site Mapper ingestion identity receives read access to source telemetry/status namespaces;
- broker persistence is enabled for MQTT session/message state.

The application remains the trust/normalization boundary. Broker ACL success does not replace
`TelemetrySource` binding, serial verification, schema validation, quarantine or durable acceptance.

## Runtime mounts

The config expects:

- `/mosquitto/config/passwd`
- `/mosquitto/config/acl`
- `/mosquitto/certs/ca.crt`
- `/mosquitto/certs/server.crt`
- `/mosquitto/certs/server.key`
- writable `/mosquitto/data/`

Generate credentials outside Git. A hardware publisher account should use the exact configured
`topicSource` as its username. The ingestion service uses its own service credential.

## Version note

Mosquitto 2.1 deprecated the legacy `password_file` and `acl_file` directives in favour of the
password-file/ACL plugins. They remain supported in 2.1.2 and are used here because the CI
certification exercises the exact official container without assuming an installation-specific
plugin path.

Before a Mosquitto 3.x upgrade, migrate this profile to the supported plugin/Dynamic Security
mechanism and rerun the same ACL/TLS certification. Do not silently carry these directives across a
major-version boundary.

## Remaining production gates

- production deployment must reuse an explicitly reviewed immutable image digest; CI is already digest-pinned;
- choose and document password-file plugin vs Dynamic Security for production lifecycle/rotation;
- provision unique high-entropy credentials or mTLS per physical source;
- certify certificate rotation and revocation;
- certify persistent-session/reconnect behaviour with the real devices;
- load-test queue limits against measured hardware cadence and outage duration;
- monitor disconnects, ACL denials, queue pressure and persistence health.
