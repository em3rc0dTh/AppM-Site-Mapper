import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = (name: string) => readFileSync(join(process.cwd(), 'src', 'app', name), 'utf8');

describe('MK1 light appearance regression', () => {
  it('keeps the root and native controls light', () => {
    const css = source('globals.css');
    expect(css).toMatch(/:root\s*\{\s*color-scheme:\s*light;/);
    expect(css).not.toContain('color-scheme: dark;');
    expect(css).toMatch(/input,\s*select\s*\{[^}]*background:\s*#ffffff;/);
    expect(css).toMatch(/textarea\s*\{[^}]*background:\s*#ffffff;/);
  });

  it('loads light styles after legacy screen CSS', () => {
    const layout = source('layout.tsx');
    expect(layout.indexOf("import './light-theme-contract.css';")).toBeGreaterThan(
      layout.indexOf("import './laptop-responsive.css';"),
    );
  });

  it('covers native text controls without restyling choice inputs', () => {
    const css = source('light-theme-contract.css');
    expect(css).toContain('color-scheme: light;');
    expect(css).toContain("input[type='password']");
    expect(css).toContain("input[type='date']");
    expect(css).toContain('textarea');
    expect(css).toContain('select option');
    expect(css).not.toContain("input[type='checkbox']");
    expect(css).not.toContain("input[type='radio']");
    expect(css).not.toContain("input[type='range']");
  });
});
