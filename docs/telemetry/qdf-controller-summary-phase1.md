# QDF controller general telemetry — phase 1

## Decision

Reuse the controller display profile, industrial catalog/normalizer and existing
summary UI. General controller observations are independent of certified physical
AccessPort A/B measurements. No database migration, new SNMP engine, MQTT/breaker,
Modbus/Metasys or commissioning changes are required.

The new optional NORMALIZED presentation mode requires a unique CURRENT or VOLTAGE
metric. RAW/ENUM v1 profiles remain valid without migration. No scale is accepted in
the display profile: normalization remains in the existing industrial source profile.

## Display contract

- General current uses the source's normalized A value; DC voltage uses its V value.
- Both require VALID quality, PROFILE interpretation, finite nonzero declared scale,
  finite numeric value, valid per-OID timestamp and recency within both the source TTL
  and the existing 130-second display TTL. Future timestamps beyond the existing
  10-second tolerance are invalid. A newer RAW observation cannot refresh an older
  normalized value.
- RAW, timestamp and quality remain visible independently. Missing, stale, invalid,
  offline or unscaled engineering values display `—`; real measured zero stays zero.
- Estimated kW uses signed current × signed voltage / 1000 only for samples at most
  5 seconds apart. It is explicitly diagnostic, never contractual power.
- Configured nominal capacity is the sum of complete, unique AccessPort nameplate
  ratings. Unverified shunts alone do not hide this configuration, but missing or
  conflicting inventory does. It does not enable availability or utilization.
- Existing certified A/B totals and electrical rules remain unchanged. B3 stays RAW
  and is not used in general totals. A3 is not computed operationally.
- The catalog client follows all cursors, rejects mixed sources, duplicate OIDs,
  invalid/repeated cursors and failed pages. It never presents a partial page set
  as a complete result. Requests are aborted on unmount and bounded to 45 seconds
  in the live view; polling does not overlap. A query error hides cached readings.

## Operator configuration / rollout

1. Confirm which real controller source belongs to the selected BDFB. No QDF UUID,
   field identity, IP address or credentials are shipped in the templates.
2. In Maintenance → SNMP controller presentation, add Smartpack2 OIDs. This preserves
   every existing OID/label/mode and appends missing template entries. For existing
   current/voltage RAW entries, explicitly select NORMALIZED and CURRENT/VOLTAGE.
   Saving uses the existing authorized, confirmed profile endpoint and history.
3. The [display template](../../config/industrial/smartpack2-controller.template.json)
   preserves the three prior controller OIDs and adds current bank 2 plus diagnostics.
   `FIELD-CONTROLLER-REPLACE` must be replaced with verified source identity.
4. Merge the [OID list](../../config/industrial/smartpack2-poll-oids.example.json) into
   the existing industrial poller's `SNMP_OPERATIONAL_POINTS_JSON`; preserve unrelated
   configured OIDs. Use the existing `industrial-poll.mjs` / industrial ingress,
   not the electrically commissioned feed collector. This PR does not change field
   runtime configuration automatically.
5. Verify units against the ELTEK screen and firmware decimal settings. Configure
   the existing `INDUSTRIAL_PROFILES_FILE` (or JSON configuration) only after evidence.
   For the diagnostic example, scale 1 for current and 0.01 for voltage would produce
   273 A and 53.74 V; these are hypotheses to validate, not defaults applied by this PR.
   Preserve all other rules. The [field template](../../config/industrial/eltek-field.template.json)
   deliberately leaves these scales absent, including bank 2.
6. Confirm new industrial samples are VALID and show expected normalized values.
   Old observations are not rewritten. Verify stale/missing/auth-error behavior.
7. Leave A/B commissioning for phase 2 with physical wiring/independence evidence.

## Bank 2 diagnostic distinction

The bundled ELTEK MIB describes:

| OID                                  | Meaning              | Diagnostic handling    |
| ------------------------------------ | -------------------- | ---------------------- |
| `1.3.6.1.4.1.12148.10.15.18.7.1.6.1` | Bank 2 current value | B3 candidate, RAW only |
| `1.3.6.1.4.1.12148.10.15.18.7.1.2.1` | Channel status       | `disabled = 4`         |
| `1.3.6.1.4.1.12148.10.15.18.7.1.5.1` | Alarm enable         | `disabled = 0`         |

A disabled alarm is distinct from a disabled channel. Field inspection must identify
which object reported disabled and why. Neither state certifies physical B3 identity.
Missing diagnostic OIDs remain unavailable. No SNMP SET is introduced.

## Acceptance and limits

Automated coverage includes normalized-vs-RAW scale handling, bad quality, source TTL,
future/invalid/stale timestamps, coherent power, real zero, signed power, source
isolation, duplicate roles, catalog pagination/401/cursor failures and nameplate
capacity independent of shunt certification. Existing SNMP feed/total regression
suites must remain passing.

Field and authenticated browser acceptance remain separate: verify source attribution,
actual API data, visual layout, voltage scale, disabled status, and A/B wiring before
release. The historical snapshot (273/5374/132) is test evidence only, never fallback
runtime data. No deployment or physical certification is implied by this change.
