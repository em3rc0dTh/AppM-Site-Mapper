# Site Mapper language policy — English baseline

## Decision

The operational user interface has **English as its only supported language** in MK1.
Do not mix Spanish and English in labels, navigation, charts, form validation,
confirmation dialogs, empty states, help text, accessibility labels or errors.

**Never translate or modify user-entered or discovered data:** inventory names,
Equipment names, room names, site names, serial numbers, source identities, OIDs,
power connection labels, device metadata, notes and historical records remain
exactly as supplied. Displaying Spanish text entered by an operator is correct.

The following are also **not translatable business data**: database enums and
identifiers, permissions, protocol names MQTT/SNMP/Modbus, BDFB, OIDs, URLs,
MQTT point keys and telemetry payload field names, SI units (V, A, W, kWh),
and literal terminal/port identities. UI descriptions of them **are** translatable.

## Current phase (English only)

- Preserve existing route URLs and deep links such as `/device/:id`,
  `/topology/...`, `/power`, and `/blueprint/:id`.
- Keep `<html lang="en">`; no locale switching, locale prefixes, cookies or
  translated URL slugs yet.
- The first catalog, `src/messages/en.json`, owns the operational labels
  formerly hardcoded in Spanish. Subsequent UI work should add semantic,
  namespaced keys there instead of introducing more literal labels.
- `tests/unit/ui-language-baseline.test.ts` ensures known Spanish UI
  labels cannot be reintroduced in the TSX interface.
- Technical error identifiers belong to APIs/logging, not the operator UI;
  callers should map them to descriptive English messages.

## i18n infrastructure (installed, English-active)

`next-intl@4.14.9` is integrated with the App Router. The plugin uses
`src/i18n/request.ts` and the root `NextIntlClientProvider`; its request
configuration intentionally forces `en` for now. The English and Spanish
catalogs in `src/messages/en.json` and `es.json` have identical keys and
are checked by `tests/unit/i18n-catalogs.test.ts`.

The shell, sign-in, password-change title, workspace heading, Equipment/BDFB
tabs and SNMP historical metric tabs use `useTranslations()` or
`getTranslations()`. Site Mapper identity and persisted inventory records
remain literal, never interpolated into translation tables.

The Spanish catalog is currently **partial** and a language selector is
available for QA in this branch. The next-intl request configuration honors a
validated preference cookie. No middleware, locale redirects or translated URL
paths are enabled. Keep this PR unmerged until bilingual acceptance is complete.

## Spanish implementation status (PR #101)

**Work in progress: English and Spanish are available for QA but Spanish is not
yet complete across every operational component. Do not merge PR #101 until
the remaining screens and state-specific messages have been audited.**

- Explicit preference: `site_mapper_locale=en|es` cookie, validated on each
  Next.js request, defaulting to English. This is a display preference only.
- The HTML `lang` attribute and next-intl messages reflect the selected locale.
  The selector lives on the authentication screen and in **Settings → Profile**,
  so the approved 22-inch topbar geometry is preserved.
- Localized screens include navigation, Workspace, Network, Site, Structure,
  Level, Room Blueprint, Rack, Equipment composition and Inspector, Power,
  Warehouse, Settings, login and several administration workflows.
- Remaining detailed components include advanced SNMP charts and diagnostics,
  Blueprint drafting controls, physical equipment diagrams, power-connection
  editors, some telemetry panels, warehouse nested options, and various
  confirmations and error states.
- **Never translate** user-entered Site/Room/Equipment data, serial numbers,
  identifiers, OIDs, BDFB, SNMP, MQTT, Modbus, shunt labels A/B,
  SI measurement units, source identities or raw telemetry.
- Catalog key parity is validated, but this cannot prove every screen has been
  extracted: native English literals still exist in unported components.
- Switching between English and Spanish must be acceptance-tested through both
  server and client navigation, including auth and responsive layouts.

## Next phase (complete Spanish i18n)

1. Extract the remaining English presentation strings from all pages, shared
   components, chart and diagnostic views, dialogs and operator-facing errors
   into semantic keys in `en.json`.
2. Translate the **presentation messages only** into `es.json`, maintaining
   key and placeholder parity; use ICU placeholders for numeric/plural cases.
3. Verify every operator-facing view and permissions-based state in both
   languages, including date/number formatting and responsive layouts.
4. Resolve language preference from an explicitly selected supported locale,
   while preserving the existing `/device/:id`, `/topology/...`, `/power`
   and `/blueprint/:id` routes. Persist preference only when authorized.
5. Enable a visible selector only after bilingual acceptance is green. Never
   infer translation language from operator-entered room/site/equipment names.

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

The baseline audit covered the 15 route-specific pages, additional Next.js
App Router pages (error, loading, not-found), 54 components and the shared
UI shell. The Spanish presentation strings were concentrated in the Equipment
inspector, the BDFB inspector and the SNMP historical metric selector. This is a
source-code audit and is **not** a live visual certification of every dynamic
role-dependent state.
