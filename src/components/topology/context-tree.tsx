import Link from 'next/link';
import type { CSSProperties } from 'react';

import type { TopologyKind } from '@/modules/topology/domain/entities';
import { Icon } from '@/shared/ui/primitives';

export interface ContextTreeEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: TopologyKind;
  readonly href: string;
}

function iconFor(kind: TopologyKind): string {
  if (kind === 'NETWORK') return 'network';
  if (kind === 'ROOM_SUBSTRUCTURE') return 'room';
  return 'box';
}

export function TopologyContextTree({
  trail,
  descendants,
}: Readonly<{
  trail: readonly ContextTreeEntry[];
  descendants: readonly ContextTreeEntry[];
}>) {
  const active = trail.at(-1);

  return (
    <nav className="context-tree legacy-context-tree" aria-label="Current infrastructure context">
      <header className="legacy-context-heading">
        <span className="legacy-context-heading-icon">
          <Icon name="network" />
        </span>
        <span>
          <strong>System Hierarchy</strong>
          <small>Infrastructure Root</small>
        </span>
      </header>

      <div className="legacy-context-scope">
        <span>Current location</span>
        <small>{trail.length.toString().padStart(2, '0')} levels</small>
      </div>

      <ol className="context-tree-trail">
        {trail.map((entry, index) => {
          const isActive = entry.id === active?.id;
          return (
            <li key={entry.id} style={{ '--context-depth': index } as CSSProperties}>
              <Link href={entry.href} aria-current={isActive ? 'page' : undefined}>
                <Icon name={iconFor(entry.kind)} />
                <span>
                  <small>{entry.kind.replaceAll('_', ' ')}</small>
                  <strong>{entry.name}</strong>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {descendants.length > 0 && (
        <div className="context-tree-children">
          <span className="context-tree-subtitle">Contained next</span>
          <ul>
            {descendants.map((entry) => (
              <li key={entry.id}>
                <Link href={entry.href}>
                  <Icon name={iconFor(entry.kind)} />
                  <span>
                    <small>{entry.kind.replaceAll('_', ' ')}</small>
                    <strong>{entry.name}</strong>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
