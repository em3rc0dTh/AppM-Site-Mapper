import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';

function uiSourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return uiSourceFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('English-first user interface', () => {
  it('defines all current operational inspector labels in English', () => {
    expect(en.equipment.inspector).toMatchObject({
      telemetry: 'Telemetry',
      overview: 'Overview',
      ports: 'Ports',
      settings: 'Settings',
    });
    expect(en.bdfb.inspector).toEqual({
      overview: 'Overview',
      feeds: 'Inputs',
      history: 'Charts',
      settings: 'Settings',
    });
    expect(en.snmp.history).toEqual({
      current: 'Current',
      voltage: 'Voltage',
      power: 'Power',
      energy: 'Energy',
    });
  });

  it('does not embed Spanish labels in TSX UI sources', () => {
    const uiFiles = uiSourceFiles(resolve(process.cwd(), 'src'));
    const untranslated: string[] = [];
    // User-entered names and telemetry data are not source labels and are
    // intentionally outside this guard. Future es.json belongs in messages.
    const spanishLabel =
      /[áéíóúñüÁÉÍÓÚÑÜ¿¡]|\b(?:Resumen|Entradas|Gráficas|Telemetría|Puertos|Corriente|Voltaje|Potencia|Guardar|Cancelar|Contraseña|Configuración|Historial)\b/u;
    for (const file of uiFiles) {
      const source = readFileSync(file, 'utf8');
      // A locale option must use its proper, user-recognizable language name.
      const text = file.endsWith('language-switcher.tsx')
        ? source.replace('<option value="es">Español</option>', '')
        : source;
      if (spanishLabel.test(text)) {
        untranslated.push(file.replace(process.cwd(), ''));
      }
    }
    expect(untranslated).toEqual([]);
  });

  it('renders the explicit selected locale as the HTML document language', () => {
    const rootLayout = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    expect(rootLayout).toContain('<html lang={locale}>');
    expect(rootLayout).toContain('await getLocale()');
  });
});
