# Site Mapper language policy — bilingual English / Español (PR #101)

## Decision

The operational user interface supports **English and Spanish as selectable presentation locales** in PR #101. Every translated screen must use one selected locale consistently for navigation, labels, charts, validation, dialogs, empty states, help text, accessibility labels and operator-facing errors. **The bilingual implementation has passed repository CI and authenticated Chromium acceptance on the PR branch.**

**Never translate or modify user-entered or discovered data:** inventory names,
Equipment names, room names, site names, serial numbers, source identities, OIDs,
power connection labels, device metadata, notes and historical records remain
exactly as supplied. Displaying Spanish text entered by an operator is correct.

The following are also **not translatable business data**: database enums and
identifiers, permissions, protocol names MQTT/SNMP/Modbus, BDFB, OIDs, URLs,
MQTT point keys and telemetry payload field names, SI units (V, A, W, kWh),
and literal terminal/port identities. UI descriptions of them **are** translatable.

## Operational language contract

- Preserve existing route URLs and deep links such as `/device/:id`,
  `/topology/...`, `/power`, and `/blueprint/:id`.
- Set the HTML `lang` attribute from the validated locale preference. Preserve existing URLs without locale prefixes or translated slugs.
- The English and Spanish catalogs, `src/messages/en.json` and `src/messages/es.json`, own operator-facing presentation messages. Subsequent UI work should add semantic,
  namespaced keys there instead of introducing more literal labels.
- `tests/unit/ui-language-baseline.test.ts` ensures known Spanish UI
  labels cannot be reintroduced in the TSX interface.
- Technical error identifiers belong to APIs/logging, not the operator UI;
  callers should map them to descriptive English messages.

## i18n infrastructure

`next-intl@4.14.9` is integrated with the App Router. The plugin uses
`src/i18n/request.ts` and the root `NextIntlClientProvider`; its request
configuration reads a validated `site_mapper_locale` preference (`en` / `es`), defaulting to English. The English and Spanish
catalogs in `src/messages/en.json` and `es.json` have identical keys and
are checked by `tests/unit/i18n-catalogs.test.ts`.

The shell and operational pages and components use `useTranslations()` or `getTranslations()`. The JSX static-language guard rejects untranslated operator-facing text, accessible labels and placeholders unless they are classified technical identities. Site Mapper identity and persisted inventory records remain literal, never interpolated into translation tables.

The English / Español selector is available on login and **Settings → Profile**.
The next-intl request configuration honors a validated preference cookie.
No middleware, locale redirects or translated URL paths are enabled.

## Implementation and acceptance evidence (PR #101)

- Both catalogs contain **1,620 messages each** and share identical semantic
  keys and ICU placeholder contracts, checked in repository CI.
- Source-level static JSX and accessibility extraction is enforced by
  `tests/unit/i18n-static-ui.test.ts`, covering at least **82 TSX files**.
  Technical units, user data, invariant equipment types and documented examples
  are explicitly allowlisted, not incorrectly translated.
- Translated routes include auth, Workspace, Network, Site, Structure, Level,
  Blueprint, Rack, Equipment composition and Inspector, Power, Telemetry,
  Warehouse and Settings, plus nested forms, validation and diagnostics.
- A real Chromium journey switches **English → Español → English**, preserves
  server/client document language, tests authenticated navigation across
  **nine route families**, and checks responsive geometry at
  **1100 / 1280 / 1366 / 1536 / 1920 pixels**, including Room Blueprint.
- The CI and MK1 HTTP/MongoDB operational acceptance workflows were green on
  code commit `ba8bc9fb` (2026-10-23), including Chromium route checks.
- BDFB, MQTT, SNMP, Modbus, OID, SI units, physical port identities and
  operator-entered inventory remain unchanged.

Automated source and browser coverage cannot prove every runtime message on
every possible permission and data combination. Changes to such states require
targeted bilingual regressions and must not reintroduce literals.

## Maintenance requirements

1. Add any new operator-facing message to the semantic `en.json` and
   `es.json` catalogs in the same pull request; keep ICU placeholders in parity.
2. Preserve the `site_mapper_locale=en|es` preference, HTML `lang` and existing
   route URLs without translated slugs.
3. Run the static-language guard, catalog parity, CI and real browser acceptance
   on every release affecting UI or locale behavior.
4. Keep domain identifiers, protocol payloads and historical records verbatim.
5. Extend authenticated browser checks when additional role-specific workflows
   or screens are introduced.

**Do not** build a custom `replace()` translator, use English sentences as
keys, translate raw payloads, or interpolate HTML into translated values.

English remains the complete fallback if a later locale is not available.
When adding Spanish, require catalog key parity so mixed-language screens
do not recur.

## UI glossary / naming conventions

| Concept                  | English interface term |
| ------------------------ | ---------------------- |
| Vista general / resumen  | Overview               |
| Telemetría               | Telemetry              |
| Puertos                  | Ports                  |
| Entradas DC              | DC inputs / Inputs     |
| Gráficas                 | Charts                 |
| Configuración            | Settings               |
| Corriente                | Current                |
| Voltaje                  | Voltage                |
| Potencia                 | Power                  |
| Energía                  | Energy                 |
| Historial y diagnósticos | History & diagnostics  |

Protocol names and physical Equipment types, such as Chassis, Shelf, Frame,
Panel and Circuit Breaker, retain the domain terminology already used in MK1.

## Validation scope

An initial AST audit identified 151 candidate literals in 35 files. Subsequent
extraction and a persistent AST test now guard static JSX and user-facing
accessibility attributes. The allowlist distinguishes technical syntax,
protocol terminology, fixed units and user data from presentation copy.
Catalog tests enforce equal message keys and placeholders. Actual Chromium
acceptance covers login, language switching, responsive layouts and nine
authenticated operational route families.

## Release gate for PR #101

- [x] Static JSX and accessible UI literals are extracted or explicitly
      classified as invariant technical text by the AST guard.
- [x] Catalog key and placeholder parity is green (1,620 messages per locale).
- [x] Typecheck, lint, Prettier format check, and repository CI are green.
- [x] Language switching and persistence pass authenticated Chromium acceptance
      across nine operational route families, including responsive viewports.
- [x] Temporary formatting and audit-probe workflows have been removed.
- [ ] Maintain reviewer approval and the repository's regular merge controls.

The branch is implementation-complete under the automated coverage described
above. This document is not a claim that every possible data- and
permission-dependent UI state has been exhaustively observed. Leave `main`
unchanged until the PR is reviewed and merged.
