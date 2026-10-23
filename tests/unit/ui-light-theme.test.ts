import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Persistent light operational theme', () => {
  it('server-renders the light theme for every locale and route', () => {
    const layout = source('src/app/layout.tsx');
    expect(layout).toContain('<html lang={locale} data-theme="light">');
    expect(layout).toContain("import './operational-light-theme.css';");
    expect(source('src/app/globals.css')).toContain('color-scheme: light;');
  });

  it('prevents dark native form controls and locale dropdowns in the light shell', () => {
    const css = source('src/app/operational-light-theme.css');
    expect(css).toContain(":root[data-theme='light']");
    expect(css).toContain('color-scheme: light;');
    expect(css).toContain('.zip-app-shell :is(input, select, textarea)');
    expect(css).toContain('.mk-login :is(input, select, textarea)');
    expect(css).toContain('select option');
    expect(css).toContain('.settings-user-create > button');
    expect(source('src/app/language-switcher.css')).not.toContain('background: #10253d');
  });

  it('uses the active translation catalog for the Settings sidebar heading', () => {
    const settings = source('src/app/settings/page.tsx');
    expect(settings).toContain('className="mk-settings-nav-title">{t(\'title\')}</span>');
    expect(source('src/app/visual-parity.css')).not.toContain("content: 'SETTINGS'");
  });
});
