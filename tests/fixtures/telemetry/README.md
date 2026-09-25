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

## myems-appm-breaker-v1.json

Sanitized structural fixture backed by the historical MyEMS/AppM implementation on
`em3rc0dTh/myems`, commit `805a748026f87c4ec25ac2e994fb186ecbdfb3e4`.

That implementation proves a breaker/port shape where:

- `reported` contains addresses such as `0_1_1`;
- a port can expose state `s`;
- electrical fields include `U1/U2`, `I1/I2`, and `P1/P2`;
- the UI interpreted `U*` as volts, `I*` as amps and `P*` as watts.

The numeric values in this fixture are synthetic and contain no production identity or secret.

This fixture is intentionally assigned to protocol profile `myems-appm-breaker-v1`, not the
ZIP-backed minimum `telxius-v1`. That distinction prevents later implementation evidence from being
retroactively attributed to the V1 minimum wire contract.
