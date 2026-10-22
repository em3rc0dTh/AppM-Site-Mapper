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

The Spanish catalog is currently **partial**: it covers the migrated
namespaces, not every operator-facing sentence in the product. Do not expose
a language selector while some screens still use hardcoded English copy.
No middleware, locale redirects, cookies or translated URL paths are enabled.

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
