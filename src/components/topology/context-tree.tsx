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
  readonly lifecycle?: 'ACTIVE' | 'ARCHIVED';
  readonly children?: readonly ContextTreeEntry[];
}

function popupHref(entry: ContextTreeEntry): string {
  if (entry.kind === 'CONTAINER_RACK') return `/popup/container/${entry.id}`;
  if (entry.kind === 'DEVICE' || entry.kind === 'EQUIPMENT') return `/popup/device/${entry.id}`;
  return entry.href;
}

function iconFor(kind: string): string {
  if (kind === 'NETWORK') return 'network';
  if (kind === 'ROOM_SUBSTRUCTURE') return 'room';
  return 'box';
}

function EntryControl({ entry, current }: Readonly<{ entry: ContextTreeEntry; current: boolean }>) {
  const popupKind = popupKindForTopology(entry.kind);
  const content = (
    <>
      <Icon name={iconFor(entry.kind)} />
      <span>
        <small>
          {entry.kind.replaceAll('_', ' ')}
          {entry.lifecycle === 'ARCHIVED' ? ' · ARCHIVED' : ''}
        </small>
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

function TreeNode({
  entry,
  currentId,
  activePath,
  depth,
}: Readonly<{
  entry: ContextTreeEntry;
  currentId: string;
  activePath: ReadonlySet<string>;
  depth: number;
}>) {
  const children = entry.children ?? [];
  const current = entry.id === currentId;
  const expanded = activePath.has(entry.id) || depth === 0;

  return (
    <li
      className={[
        'context-tree-node',
        current ? 'is-current' : '',
        entry.lifecycle === 'ARCHIVED' ? 'is-archived' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--context-depth': depth } as CSSProperties}
    >
      {children.length > 0 ? (
        <details open={expanded}>
          <summary aria-label={`Toggle ${entry.name} descendants`}>
            <span className="context-tree-disclosure">▸</span>
            <EntryControl entry={entry} current={current} />
          </summary>
          <ol>
            {children.map((child) => (
              <TreeNode
                key={child.id}
                entry={child}
                currentId={currentId}
                activePath={activePath}
                depth={depth + 1}
              />
            ))}
          </ol>
        </details>
      ) : (
        <div className="context-tree-leaf">
          <span className="context-tree-disclosure is-empty">·</span>
          <EntryControl entry={entry} current={current} />
        </div>
      )}
    </li>
  );
}

export function TopologyContextTree({
  trail,
  tree,
  supplemental = [],
  descendants = [],
}: Readonly<{
  trail: readonly ContextTreeEntry[];
  tree?: readonly ContextTreeEntry[];
  supplemental?: readonly ContextTreeEntry[];
  descendants?: readonly ContextTreeEntry[];
}>) {
  const active = trail.at(-1);
  const activePath = new Set(trail.map((entry) => entry.id));
  const roots = tree ?? (trail[0] ? [{ ...trail[0], children: descendants }] : []);
  const extras = supplemental.length > 0 ? supplemental : [];

  return (
    <nav className="context-tree legacy-context-tree" aria-label="Infrastructure hierarchy">
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

      <div className="context-tree-full">
        <ol>
          {roots.map((entry) => (
            <TreeNode
              key={entry.id}
              entry={entry}
              currentId={active?.id ?? ''}
              activePath={activePath}
              depth={0}
            />
          ))}
        </ol>
      </div>

      {extras.length > 0 && (
        <div className="context-tree-supplemental">
          <span>INTERNAL / NEXT</span>
          {extras.map((entry) => (
            <EntryControl key={entry.id} entry={entry} current={entry.id === active?.id} />
          ))}
        </div>
      )}
    </nav>
  );
}
