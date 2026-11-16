# Legacy Power Findings

Status: G1 evidence for BDFB and Power Path.

## BDFB hierarchy evidence

The legacy CAS/device construction path contains logic for building a BDFB chassis with:

`Device -> Shelf -> Frame -> Panel -> Breaker/Holder`

and includes both framed and left/right no-frame construction paths.

This hierarchy is a strong candidate for preservation as domain knowledge, not as an embedded side effect of rack mounting.

## Power Path UI evidence

`components/device/power-path-overlay.tsx` receives identifiers or labels for:

- source device;
- source panel;
- source breaker;
- target device label;
- target equipment index.

This demonstrates an implemented source-to-target electrical relationship in the UI.

## What is not yet proven

The current evidence does not by itself establish a complete canonical electrical graph.

G2/G9 still need explicit rules for:

- source and destination entity types;
- A/B feed semantics;
- breaker ownership;
- panel ownership;
- target equipment identity;
- redundant-feed validity;
- path lifecycle;
- provisioning state;
- whether electrical topology is persisted or derived.

## Migration rule

Preserve the electrical concepts and validated workflows.

Do not preserve the legacy choice to derive domain meaning inside a popup/overlay component.
