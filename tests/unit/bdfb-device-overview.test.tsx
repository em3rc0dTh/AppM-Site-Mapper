import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BdfbChassis } from '../../src/components/power/bdfb-chassis';
import type { DeviceNode, Panel } from '../../src/modules/topology/domain/entities';

const timestamp = '2026-09-28T00:00:00.000Z';

function panel(id: string, label: string): Panel {
  return {
    id,
    label,
    endpoints: [
      {
        id: `${id}-1`,
        variant: 'HOLDER',
        label: 'Holder 1',
      },
      {
        id: `${id}-2`,
        variant: 'BREAKER',
        label: 'Breaker 2',
      },
    ],
  };
}

const device: DeviceNode = {
  id: 'device-bdfb',
  parentId: 'rack-1',
  name: 'BDFB',
  kind: 'DEVICE',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
  pinned: false,
  category: 'BDFB',
  bdfb: {
    shelves: [
      {
        id: 'shelf-1',
        label: 'Main Shelf',
        frames: [
          {
            id: 'frame-a',
            label: 'Frame A',
            panels: [panel('a1', 'Panel A1'), panel('a2', 'Panel A2'), panel('a3', 'Panel A3')],
          },
          {
            id: 'frame-b',
            label: 'Frame B',
            panels: [panel('b1', 'Panel B1'), panel('b2', 'Panel B2'), panel('b3', 'Panel B3')],
          },
        ],
      },
    ],
  },
};

describe('BDFB device hierarchy overview', () => {
  it('shows Device → Shelf → Frame → Panel without endpoint detail at device level', () => {
    const markup = renderToStaticMarkup(<BdfbChassis device={device} />);

    expect(markup).toContain('DEVICE');
    expect(markup).toContain('Main Shelf');
    expect(markup).toContain('Frame A');
    expect(markup).toContain('Frame B');
    expect(markup).toContain('Panel A1');
    expect(markup).toContain('Panel B3');
    expect(markup).toContain('2 FRAMES');
    expect(markup).toContain('6 PANELS');

    expect(markup).not.toContain('Holder 1');
    expect(markup).not.toContain('Breaker 2');
    expect(markup).not.toContain('BUS A');
    expect(markup).not.toContain('BUS B');

    expect(markup.match(/Open Panel [AB][123] breaker detail/g)).toHaveLength(6);
  });
});
