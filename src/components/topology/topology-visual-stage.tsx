import Link from 'next/link';

import type { TopologyNode } from '@/modules/topology/domain/entities';
import { Icon } from '@/shared/ui/primitives';

export interface VisualStageChild {
  readonly node: TopologyNode;
  readonly href: string;
}

export interface VisualStageNotice {
  readonly title: string;
  readonly description: string;
}

export function TopologyChildren({ items }: Readonly<{ items: readonly VisualStageChild[] }>) {
  return (
    <nav className="physical-children" aria-label="Contained infrastructure">
      {items.map(({ node, href }) => (
        <Link className="physical-child" key={node.id} href={href}>
          <Icon name={node.kind === 'ROOM_SUBSTRUCTURE' ? 'room' : 'box'} />
          <span>
            <small>{node.kind.replaceAll('_', ' ')}</small>
            <strong>{node.name}</strong>
            <span>
              {node.lifecycle}
              {node.kind === 'POSITION' && ` · ${node.coordinate.row}-${node.coordinate.column}`}
              {node.kind === 'CONTAINER_RACK' && node.totalU && ` · ${node.totalU} U`}
            </span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      ))}
      {items.length === 0 && <p>No contained infrastructure.</p>}
    </nav>
  );
}

export function TopologyVisualStage({
  node,
  items,
  notice,
}: Readonly<{
  node: TopologyNode;
  items: readonly VisualStageChild[];
  notice?: VisualStageNotice;
}>) {
  return (
    <section className="physical-stage" aria-label={`${node.name} contents`}>
      <header className="physical-stage-heading">
        <strong>{items.length} contained</strong>
        <span>Schematic view</span>
      </header>
      {notice && (
        <p className="physical-notice">
          <strong>{notice.title}</strong> · {notice.description}
        </p>
      )}
      <TopologyChildren items={items} />
    </section>
  );
}
