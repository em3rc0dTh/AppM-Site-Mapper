import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = () =>
  readFileSync(join(process.cwd(), 'src', 'app', 'laptop-responsive.css'), 'utf8');

describe('Device / Equipment visual acceptance contract', () => {
  it('keeps the workbench three-zone from 941px through 1199px', () => {
    const source = css();
    expect(source).toContain('@media (min-width: 941px) and (max-width: 1199px)');
    expect(source).toContain(
      'grid-template-columns: minmax(220px, 25%) minmax(0, 50%) minmax(220px, 25%) !important;',
    );
    expect(source).toMatch(
      /\.mk-device-layout > \.zip-device-inspector,[\s\S]*grid-column: 3 !important;/,
    );
    expect(source).toMatch(
      /\.mk-device-layout > \.zip-device-stage,[\s\S]*grid-column: 2 !important;/,
    );
  });

  it('protects search and alarms before optional warehouse navigation', () => {
    const source = css();
    expect(source).toMatch(/\.zip-topbar-actions \.mk-search-trigger[\s\S]*min-width: 124px;/);
    expect(source).toMatch(
      /\.zip-topbar-actions \.sm-alarm-header[\s\S]*min-width: max-content;/,
    );
    expect(source).toMatch(
      /\.zip-topbar-actions \.zip-warehouse[\s\S]*display: none !important;/,
    );
  });

  it('keeps deep topology labels readable in the acceptance range', () => {
    const source = css();
    expect(source).toMatch(
      /\.zip-app-shell \.telxius-tree-copy strong[\s\S]*white-space: normal;[\s\S]*overflow-wrap: anywhere;/,
    );
  });
});
