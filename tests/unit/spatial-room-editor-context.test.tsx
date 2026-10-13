import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PolygonEditor } from '@/components/spatial/polygon-editor';

describe('Polygon Editor surveyed context', () => {
  it('renders the surveyed Structure extent and named sibling Rooms as non-editable overlays', () => {
    const html = renderToStaticMarkup(
      createElement(PolygonEditor, {
        title: 'DRAW ROOM BOUNDARY · Prueba1',
        contextLabel: 'Structure boundary (Level reference)',
        context: [
          { x: 0, y: 0 },
          { x: 6000, y: 0 },
          { x: 6000, y: 6000 },
          { x: 0, y: 6000 },
        ],
        contextOverlays: [
          {
            id: 'room-1',
            label: 'Sala de transmisiones',
            polygon: [
              { x: 0, y: 0 },
              { x: 2400, y: 0 },
              { x: 2400, y: 2400 },
              { x: 0, y: 2400 },
            ],
          },
        ],
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain('Structure boundary (Level reference)');
    expect(html).toContain('Sala de transmisiones');
    expect(html).toContain('existing space(s)');
    expect(html).toContain('pointer-events="none"');
    expect(html).toContain('Draw only at X ≥ 0');
  });
});
