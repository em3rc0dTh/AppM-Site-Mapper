import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PowerCanvasRoute, type PowerCanvasStage } from '@/components/power/power-canvas-route';

const source: PowerCanvasStage[] = [
  { id: 'bdfb-device', kind: 'DEVICE', name: 'BDFB-01' },
  { id: 'chassis', kind: 'CHASSIS', name: 'Chassis' },
  { id: 'shelf', kind: 'SHELF', name: 'Shelf A' },
  { id: 'frame', kind: 'FRAME', name: 'Frame A1' },
  { id: 'panel', kind: 'PANEL', name: 'Panel A1' },
  { id: 'breaker', kind: 'CIRCUIT_BREAKER', name: 'Breaker CB-01' },
  { id: 'out', kind: 'ACCESS_PORT', name: 'POWER OUT' },
];

const target: PowerCanvasStage[] = [
  { id: 'switch-device', kind: 'DEVICE', name: 'SWITCH-01' },
  { id: 'switch-chassis', kind: 'CHASSIS', name: 'Switch Chassis' },
  { id: 'switch-module', kind: 'PLUGGABLE_MODULE', name: 'Switch Pluggable Module' },
  { id: 'in', kind: 'ACCESS_PORT', name: 'AP-1 Feed A' },
];

function markup(extraSourceStages: PowerCanvasStage[] = []) {
  return renderToStaticMarkup(
    createElement(PowerCanvasRoute, {
      sourceStages: [...source, ...extraSourceStages],
      targetStages: target,
      sourceEquipmentName: 'Breaker CB-01',
      targetEquipmentName: 'Switch Pluggable Module',
      sourcePortName: 'POWER OUT',
      targetPortName: 'AP-1 Feed A',
      feed: 'A',
    }),
  );
}

describe('Power Canvas complete path', () => {
  it('renders the destination, input port and cable even after six source ancestry stages', () => {
    const html = markup();
    expect(html).toContain('Breaker CB-01');
    expect(html).toContain('POWER OUTPUT');
    expect(html).toContain('POWER OUT');
    expect(html).toContain('POWER PATH · FEED A · CONFIGURED');
    expect(html).toContain('POWER INPUT');
    expect(html).toContain('Switch Pluggable Module');
    expect(html).toContain('AP-1 Feed A');
    expect(html).toContain('SWITCH-01');
    expect(html).toContain('Switch Chassis');
  });

  it('does not silently omit ancestors when a source has more than six', () => {
    const html = markup(
      Array.from({ length: 8 }, (_, i) => ({
        id: `extra-${i}`,
        kind: 'FRAME',
        name: `Extra ancestor ${i + 1}`,
      })),
    );
    expect(html).toContain('Extra ancestor 8');
    expect(html).toContain('AP-1 Feed A');
  });

  it('keeps the route configured, not electrically LIVE without telemetry evidence', () => {
    const html = markup();
    expect(html).toContain('CONFIGURED');
    expect(html).not.toContain('● ACTIVE');
    expect(html).not.toContain('LIVE');
  });
});
