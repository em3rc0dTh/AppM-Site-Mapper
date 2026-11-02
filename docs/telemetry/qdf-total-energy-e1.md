# QDF TOTAL Energy E1 — RFP closure contract

## Scope

E1 closes the TELXIUS RFP software gap for TOTAL QDF Energy **over the requested historical window**.
It is additive to the existing Current, Power and Voltage contracts.

## Authority

The telemetry store already integrates each verified SNMP input feed from simultaneous paired
current/voltage observations using trapezoidal energy over real intervals of at most 120 seconds.
E1 does not introduce another temporal integrator. It aggregates those existing feed-energy
intervals only when the QDF inventory and evidence are complete.

## Canonical rule

A bucket is eligible only when:

- the BDFB hardware inventory is complete;
- every expected independent input feed is present and uniquely positioned;
- every feed is verified FIELD evidence;
- every sample in the bucket has paired voltage/current evidence;
- sample counts match across all expected feeds;
- observed coverage matches across all expected feeds;
- observation timestamps remain within the existing historical alignment bound.

For an eligible bucket:

```text
TOTAL_QDF_ENERGY_INTERVAL = SUM(feed.estimatedEnergyKwh)
TOTAL_QDF_ENERGY_WINDOW   = cumulative sum of accepted intervals
```

An ineligible bucket is omitted. Missing consumption is never replaced with zero and gaps are never
interpolated.

## API surface

`GET /api/telemetry/snmp/feeds/trends?deviceId=<id>&window=<window>` adds:

```json
{
  "totalEnergy": {
    "unit": "kWh",
    "semantics": "SUM_VERIFIED_FEED_ENERGY_OVER_OBSERVED_INTERVALS",
    "source": "DERIVED_FROM_PAIRED_VOLTAGE_CURRENT",
    "maxIntegratedGapSeconds": 120,
    "points": []
  }
}
```

Existing response fields remain unchanged.

## Local web / load-report surface

The SNMP history Energy chart adds a backend-provided `TOTAL QDF` series. The summary energy and
coverage values use only the canonical total-energy points instead of summing incomplete frontend
feed data.

## Explicit non-goals

E1 does **not**:

- change MQTT or SNMP transport;
- change telemetry bindings;
- change Timescale or Mongo schemas;
- change breaker telemetry;
- change Current, Power or Voltage semantics;
- change any Modbus address or the legacy 0–767 block;
- create a lifetime/persistent energy totalizer;
- backfill missing intervals.

A durable lifetime counter is E2/post-RFP hardening.
