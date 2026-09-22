# G1 — Legacy Mining & Product Truth Receipt

Status: **PASS**

Frozen evidence source:

- repository: `thradexIT/site-mapper`
- commit: `22c7b8c495a026e34732fe0b7e3848b8c37e84c7`

## Delivered evidence

- legacy baseline and evidence rules;
- capability matrix;
- route inventory;
- component inventory;
- domain findings;
- data/persistence findings;
- spatial/Blueprint findings;
- CAS findings;
- BDFB/Power findings;
- telemetry findings;
- identity/security findings;
- security migration blockers;
- Product Truth Register;
- external-information register;
- migration map.

## Confirmed boundaries

- no legacy runtime implementation was copied;
- no secret values were copied;
- no production data was copied;
- no canonical terminology was silently frozen;
- no persistence technology/model was declared authoritative;
- no legacy authentication implementation was selected;
- no legacy telemetry endpoint was accepted as MK1 architecture.

## G2 entrance evidence

G1 has separated:

1. confirmed product/domain behavior;
2. conflicting legacy terminology;
3. rejected legacy architecture;
4. external information that GitHub cannot prove.

G2 may therefore design the canonical domain without relying on hidden aliases or undocumented assumptions.

## Remaining external inputs

Items in `docs/legacy/external-information-register.md` remain open by design. They do not invalidate G1; they constrain what G2/G3/G4/G6/G7/G9/G10 may freeze.

## Certification

Final G1 evidence head passed the complete CI pipeline before this receipt was sealed:

- typecheck;
- lint;
- format check;
- unit tests;
- integration-test harness;
- production build;
- production dependency audit.

The PR diff is documentation/evidence only and contains no legacy runtime code or secret material.

## Gate verdict

**PASS — G2 Canonical Domain Contract may begin after this PR is integrated into `main`.**
