# Telemetry fixtures

## telxius-v1-minimal.json

Source-backed minimum extracted from the V1 Telxius internal architecture evidence.

The historical contract proves only:

- a JSON object;
- `sn` as the device serial identity used by the browser;
- a `reported` object;
- arbitrary reported keys/values at this boundary.

The source example uses `metric_key: 13.09`.

This fixture intentionally does **not** add:

- voltage/current/power key names;
- units;
- device timestamps;
- message IDs;
- sequences;
- breaker-address structure.

Those belong to later implementation evidence or the MK1 canonical contract and must not be
retroactively attributed to the V1 raw wire format.
