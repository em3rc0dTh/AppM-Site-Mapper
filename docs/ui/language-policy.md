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

## Next phase (internationalization)

Adopt **next-intl** with the Next.js App Router, using typed/namespaced JSON
message catalogs and ICU-style placeholders for interpolation and pluralization.

Proposed layout:

```text
src/
  i18n/
    request.ts
    routing.ts          # Only if locale-dependent routing is needed
  messages/
    en.json             # Source-of-truth keys
    es.json             # Future complete Spanish catalog
```

1. Extract remaining English presentation strings from all screens, components,
   and operator-facing API errors into `en.json` with stable semantic keys
   (e.g. `equipment.inspector.overview`).
2. Add `es.json` with key parity, language-specific number/date formatting and
   snapshot/regression tests.
3. Use `getTranslations()` in Server Components and `useTranslations()` in
   Client Components, and a localized provider where required.
4. Keep current paths without a locale prefix unless product requirements change.
   A no-routing setup or `localePrefix: 'never'` can avoid a disruptive URL
   migration. Verify language preference handling against authenticated sessions.
5. Let the operator choose the locale. Persist a preference only when explicitly
   authorized. Never infer UI locale from the language used for inventory names.

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
