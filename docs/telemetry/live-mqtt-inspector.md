# Live MQTT inspector

The inspector displays the latest accepted BFDB packet per source and its normalized breaker readings. Operator labels, status messages, accessibility labels and empty states use the English/Spanish presentation catalogs; packet keys, source identities and electrical units remain technical data.

The panel selector and normalized payload share the same effective panel. When the selected panel is absent from the latest packet, both use `ALL` immediately, without an effect-driven state update. The requested panel is retained and becomes effective again if it reappears; explicitly changing the source resets the request to `ALL`.

This presentation correction does not change MQTT ingestion, power/energy derivation, or the Metasys register contract.

## Validation

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npx vitest run tests/unit/i18n-catalogs.test.ts tests/unit/i18n-static-ui.test.ts tests/unit/metasys-eltek-modbus-projection.test.ts`

The catalog tests verify matching English/Spanish keys and interpolation variables. The static UI test rejects untranslated literal labels. The projection regression checks the existing 17-point Metasys mapping. These checks do not constitute field acceptance by Metasys.
