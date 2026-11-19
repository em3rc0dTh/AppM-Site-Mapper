# QDF breaker field schedule — seed-01 v14

## Scope

The 19.11.2026 source declares **76 physically represented circuit-breaker endpoints**:

- QDF-2: 26,
- QDF-4: 14,
- QDF-5: 36.

QDF-4 position 7 is now an explicit A/B breaker pair for Orion. The previous workbook only
supported a rack association there; the 19.11 source supersedes that limitation.

## Data and provenance

Current field source:

```text
Lista de Equipos NUEVO QDF-2-4-5  mop ver.19.11.2026.xlsx
```

The seed records:

- `attributes.ratedCurrentA`: documentary nominal breaker rating, initialized only when no
  existing nominal rating or commissioned protection exists;
- `declaredPower.documentedRatingA`: documentary rating;
- `declaredPower.targetFootprint`: HUELLA / documentary destination rack reference;
- `declaredPower.targetRackAid`: `RACK::<HUELLA>`;
- `declaredPower.documentedStatus`: `IN_SERVICE` or `OFF` from the source;
- `declaredPower.replacementTargetA`: proposed replacement size;
- `declaredPower.targetLabel`: current source label;
- `declaredPower.targetAid`: current endpoint AID;
- `declaredPower.targetAliases` / breaker `aliases[]`: current + historical source labels;
- `declaredPower.targetAidAliases`: historical AIDs when endpoint notation changes.

Display-name changes do not create another powered equipment identity. Examples include
`GRTLUREM3` → stable logical `GRTLuren3`, and legacy `GXLUR01/02` → current
`GX-LUR-01/02`.

## Orion

The current source explicitly documents:

```text
A3-07 Orion
B3-07 Orion
HUELLA 010205.16
80 A
APAGADO / Reemplazar x 60
```

Seed v14 therefore materializes the two breaker positions in the QDF topology and declares their
remote target as Orion. It does **not** materialize Orion itself as remote Equipment or infer rack-U.

## Protection and telemetry

`ratedCurrentA` is not an alarm threshold. No alarm assert/clear thresholds are inferred.

The Fluke/AEMC/Thradex values in the source are field-measurement evidence; seed-01 does not
rewrite live telemetry with those spreadsheet values. Documentary `OFF` is likewise not a
real-time electrical state.

## Upgrade safety

On an existing installation, seed v14 updates source-managed target declarations and preserves:

- operator-corrected target labels that no longer equal a known source alias,
- operator-edited PDU remarks,
- commissioned protection settings,
- existing IDs and PowerPaths.

Old source target labels and AIDs remain compatibility evidence rather than being deleted.

## Acceptance

1. Require seed version **14**.
2. Verify QDF-2/QDF-4/QDF-5 contain **26/14/36** breaker endpoints, total **76**.
3. Verify QDF-4 A3-07/B3-07 are Orion with 80 A documentary rating, OFF status and proposed 60 A
   replacement.
4. Verify current source labels/AIDs are visible while historical aliases remain searchable.
5. Verify rerunning the seed does not overwrite commissioned protection or operator-corrected
   target declarations.
6. Require CI, clean-stack, HTTP/Mongo browser acceptance, Industrial Safety and S05 to pass before
   merge.
