'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';

import { Icon } from '@/shared/ui/primitives';
import { openPhysicalPopup, popupKindForTopology } from '@/shared/ui/physical-popup';

export interface ContextTreeEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly href: string;
}

function popupHref(entry: ContextTreeEntry): string {
  if (entry.kind === 'CONTAINER_RACK') return `/popup/container/${entry.id}`;
  if (entry.kind === 'DEVICE' || entry.kind === 'EQUIPMENT') return `/popup/device/${entry.id}`;
  return entry.href;
}

function ContextEntry({
  entry,
  current,
}: Readonly<{ entry: ContextTreeEntry; current?: boolean }>) {
  const popupKind = popupKindForTopology(entry.kind);
  const content = (
    <>
      <Icon name={iconFor(entry.kind)} />
      <span>
        <small>{entry.kind.replaceAll('_', ' ')}</small>
        <strong>{entry.name}</strong>
      </span>
    </>
  );

  if (popupKind) {
    return (
      <button
        type="button"
        className="context-tree-popup-link"
        aria-current={current ? 'page' : undefined}
        onClick={() => openPhysicalPopup(popupHref(entry), popupKind, entry.id)}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={entry.href} aria-current={current ? 'page' : undefined}>
      {content}
    </Link>
  );
}

function iconFor(kind: string): string {
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
        <small>DEPTH {trail.length.toString().padStart(2, '0')}</small>
      </div>

      <ol className="context-tree-trail">
        {trail.map((entry, index) => {
          const isActive = entry.id === active?.id;
          return (
            <li key={entry.id} style={{ '--context-depth': index } as CSSProperties}>
              <ContextEntry entry={entry} current={isActive} />
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
                <ContextEntry entry={entry} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
