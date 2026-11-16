# Controlled reconciliation: field Acrel MQTT breaker bindings

## Problem and evidence (2026-11-16)

A Site Mapper B3 panel displayed six current measurements belonging to the raw
MQTT group for meter slave 3. The physical meter commissioning reference assigns
B3 to slave 5. A broker capture confirmed that the source publishes both groups.
The UI values agreed exactly with the wrong group's payload; a browser formatting
change cannot resolve the ownership problem.

The canonical **field** meter map is:

| Panel | RS485 meter slave | Raw MQTT group | Positions |
| --- | ---: | --- | --- |
| A3 | 1 | 0_1_N | 1..24 |
| A2 | 3 | 0_3_N | 1..24 |
| B3 | 5 | 0_5_N | 1..24 |
| B2 | 7 | 0_7_N | 1..24 |

For the FIELD_DUAL_12 wire profile, raw objects 1..12 contain two independent
channels: #1 maps to panel positions 1..12 and #2 to positions 13..24.
Raw objects 13..24 may contain connectivity-only shadows; they are **not**
additional measured circuits. The legacy single-channel profile is separate.

The public repository must never embed client serials, IP addresses, commissioning
workbooks, MQTT secrets or database exports.

## Changes in this fix

1. BFDB parent breaker projections reject any FIELD_DUAL_12 point whose declared
   panel and physical position do not match the resolved breaker topology.
2. Independent breaker Latest State applies the same check before publishing LIVE
   measurements; old corrupt bindings cannot continue projecting data onto the
   wrong panel.
3. The private-manifest reconciler audits **all four panels across all three QDFs**
   and plans replacement of only existing active, incorrectly mapped breaker
   metric bindings. It does not synthesize measurements or create Equipment.
4. Readings, historian records, PowerPath, SOURCE bindings, SNMP and equipment
   topology are never silently rewritten.

## Read-only audit on the MongoDB host

Use the *private* S05 manifest already held in .runtime; it must include all three
QDFs and each meter's physical address and identity.

Do not paste the URI or the private manifest into Git, logs or chat.

~~~bash
# From the Site Mapper repository root, with MONGODB_URI already exported
node scripts/operations/reconcile-field-mqtt-bindings.mjs \
  --manifest .runtime/s05-commissioning-reference.json \
  --database seed-01 \
  --expected-qdfs 3 \
  > .runtime/field-binding-plan.json
~~~

Check the plan for every panel and every installed breaker. Possible results:

- MATCH: physical target and MQTT source point agree.
- REMAP: an existing metric must be archived and recreated on the correct point.
- UNCOMMISSIONED: a breaker has no metric bindings; this is not permission to
  invent a binding.
- BLOCK_*: missing/conflicting inventory, duplicate source owner, protected
  operator/FIELD confirmation, ambiguous target metric, orphan or point collision.
  Any BLOCK prevents **all** changes across the three sources.

The script does not claim a meter is electrically certified merely because
telemetry arrived, nor does it use the nominal cabinet voltage as a substitute
for actual voltage readings.

## Operator-controlled APPLY

Run a full MongoDB backup through the approved backup workflow *before* APPLY.
Review the private plan and the meter configurations. Only when the plan has no
BLOCK_* findings, explicitly request the atomic change:

~~~bash
node scripts/operations/reconcile-field-mqtt-bindings.mjs \
  --manifest .runtime/s05-commissioning-reference.json \
  --database seed-01 \
  --expected-qdfs 3 \
  --apply \
  --ack RECONCILE_FIELD_BINDINGS \
  --backup .runtime/field-bindings-before-apply.json
~~~

- Backup snapshot is created with exclusive creation and restrictive permissions.
- APPLY refuses FIELD-verified/operator-confirmed mappings and conflicts; they
  require a separately verified operator procedure.
- For each moved metric, its former binding is ARCHIVED (never deleted), and a
  new deterministic, canonical source point binding is inserted in **one MongoDB
  transaction**. A revision/concurrency failure rolls the transaction back.
- No HTTP endpoint is exposed to perform this migration.
- If APPLY fails, keep the pre-change backup and inspect the error; do not run
  a blind seed, truncate or regenerate telemetry.

The private JSON snapshot is audit/rollback evidence, not a replacement for the
approved MongoDB backup. Any rollback must be a separately reviewed and
transactional procedure.

## Acceptance after APPLY

1. Re-run read-only plan: zero REMAP and zero BLOCK_*.
2. Verify each installed breaker has only the expected source/point/metric
   ownership (including channel 1/2), without duplicate active metrics.
3. Wait for the next **actual** MQTT publication before comparing live UI.
   For B3 the raw point prefix must be slave 5, never slave 3.
4. Compare the same message timestamp and point in RAW, Equipment Latest,
   physical panel UI, Timescale and Modbus bridge.
5. Zero voltage or power in the raw telemetry remains zero; it is not a
   UI defect or a reason to synthesize a nominal reading.
6. Validate the physical measurement scaling with field instrumentation before
   promoting commissioning to FIELD_VERIFIED.
7. Verify existing historical records and SNMP shunt routes are preserved.

Do not conflate an MQTT ONLINE state with valid VIPE electrical measurements.
