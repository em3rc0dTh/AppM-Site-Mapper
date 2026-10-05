import Link from 'next/link';

import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import type { DeviceNode, TopologyNode } from '@/modules/topology/domain/entities';

export function BdfbPowerTree({
  device,
  trail,
  selfHref,
  activePanelId,
  presentation,
}: Readonly<{
  device: DeviceNode;
  trail: readonly TopologyNode[];
  selfHref: string;
  activePanelId?: string | undefined;
  presentation: BdfbPresentation;
}>) {
  const site = trail.find((node) => node.kind === 'SITE');
  const structure = trail.find((node) => node.kind === 'STRUCTURE');

  return (
    <nav className="zip-bdfb-tree" aria-label="BDFB power tree">
      <Link className="zip-bdfb-back" href="/power">
        ← POWER PATH
      </Link>
      <header>
        POWER TREE <span>⌄</span>
      </header>
      <div className="zip-bdfb-tree-body">
        {site && (
          <div className="zip-bdfb-tree-row level-0">
            <span>⌄</span>
            <b>◎</b>
            <strong>{site.name}</strong>
          </div>
        )}
        {structure && (
          <div className="zip-bdfb-tree-row level-1">
            <span>⌄</span>
            <b>▦</b>
            <strong>{structure.name}</strong>
          </div>
        )}
        <Link className="zip-bdfb-tree-row level-2 is-selected" href={selfHref}>
          <span>⌄</span>
          <b>▥</b>
          <strong>{device.name}</strong>
        </Link>
        {presentation.shelves.map((shelf) => (
          <div key={shelf.id}>
            <div className="zip-bdfb-tree-row level-3">
              <span>⌄</span>
              <b>▤</b>
              <strong>{shelf.label}</strong>
            </div>
            {shelf.frames.map((frame) => (
              <div key={frame.id}>
                <div className="zip-bdfb-tree-row level-4">
                  <span>⌄</span>
                  <b>▥</b>
                  <strong>{frame.label}</strong>
                </div>
                {frame.panels.map((panel) => (
                  <Link
                    key={panel.id}
                    className={`zip-bdfb-tree-row level-5 ${activePanelId === panel.id ? 'is-selected' : ''}`}
                    href={`${selfHref}?panel=${encodeURIComponent(panel.id)}`}
                  >
                    <span />
                    <b>▧</b>
                    <strong>{panel.label}</strong>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
