# QDF breaker field schedule — seed-01 v10

## Scope

The internal seed declares 74 physically represented circuit breakers across QDF-2
(26), QDF-4 (12), and QDF-5 (36). Each paired A3/B3 breaker has a numeric
documentary nominal rating, destination footprint reference, documentary status,
and a source document reference.

The workbook also contains two rows for QDF-4 position 7, but these do not
authorize materializing additional breakers or attributing a named reservation to
anyone. Installed breaker count remains **74**.

## Data and provenance

- `attributes.ratedCurrentA`: numeric nominal rating from the worksheet,
  initialized only when no existing nominal rating or commissioned protection
  exists.
- `attributes.declaredPower.documentedRatingA`: documentary rating retained
  separately for reconciliation.
- `attributes.declaredPower.targetFootprint`: string identifying the destination
  (for example `010202.11`), **not** the rack dimension in millimeters.
- `attributes.declaredPower.documentedStatus`: `IN_SERVICE` or `OFF` as
  documented at the source, not independently verified energized state.
- `attributes.declaredPower.replacementTargetA`: proposed replacement size;
  it never changes an installed rating automatically.
- Existing operator-reviewed declarations and approved protection records take
  precedence on subsequent seed upgrades.

The workbook is the source of these **documentary** attributes. A remote load
is not considered materialized or connected without separately verified
Equipment, AccessPorts, and PowerPath records.

## Protection and alarms

`ratedCurrentA` is **not** an alarm threshold. The existing protection editor
and policy service govern `assertAboveA` and `clearBelowA`. An actual
overcurrent alarm requires an enabled policy and a valid, timely CURRENT
telemetry binding, plus the existing alarm evaluator's rules. No thresholds
are inferred from the workbook, and the seed does not create or enable them.

## Acceptance

1. Verify the seed version is 10 and that QDF-2/QDF-4/QDF-5 still have
   26/12/36 installed breakers.
2. Verify the inspector shows destination, footprint, documented status, and
   nominal rating without replacing the rack's physical footprint.
3. Verify rerunning the seed does not overwrite already commissioned
   `breakerProtection` settings, alarm policies, or operator-corrected
   declarations.
4. Verify alarm assertion and recovery with an approved policy and a real or
   isolated test CURRENT binding. Do not interpret documentary `OFF` as a
   real-time electrical measurement.
5. Require CI, clean-stack, HTTP/MongoDB browser acceptance, and S05 checks
   to pass before merge. The seed must be executed deliberately on existing
   installations; merging code alone does not mutate deployed databases.
