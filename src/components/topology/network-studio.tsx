'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type CSSProperties } from 'react';

import type { NetworkNode, SiteNode } from '@/modules/topology/domain/entities';
import type { VisualStageChild } from '@/components/topology/topology-visual-stage';

interface SitePortal {
  readonly node: SiteNode;
  readonly href: string;
}

function normalizePolygon(points: readonly Readonly<{ x: number; y: number }>[]) {
  if (points.length < 3) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padding = 12;
  const targetWidth = 216;
  const targetHeight = 116;
  const scale = Math.min((targetWidth - padding * 2) / width, (targetHeight - padding * 2) / height);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const offsetX = (targetWidth - renderedWidth) / 2;
  const offsetY = (targetHeight - renderedHeight) / 2;

  return points
    .map((point) => {
      const x = offsetX + (point.x - minX) * scale;
      const y = offsetY + (point.y - minY) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function NetworkStudio({
  node,
  sites,
}: Readonly<{
  node: NetworkNode;
  sites: readonly VisualStageChild[];
}>) {
  const router = useRouter();
  const sitePortals = useMemo(
    () =>
      sites.flatMap(({ node: child, href }) =>
        child.kind === 'SITE' ? [{ node: child, href }] : [],
      ),
    [sites],
  );
  const [selectedId, setSelectedId] = useState(sitePortals[0]?.node.id ?? null);
  const selected = sitePortals.find((site) => site.node.id === selectedId) ?? sitePortals[0];

  return (
    <section className="studio-network" aria-label={`${node.name} network topology`}>
      <header className="studio-network-hud">
        <div>
          <small>INFRASTRUCTURE ROOT</small>
          <strong>{node.name}</strong>
          <span>Configured topology · site geometry is physical, placement on this view is schematic</span>
        </div>
        <div className="studio-network-count">
          <b>{sitePortals.length.toString().padStart(2, '0')}</b>
          <span>{sitePortals.length === 1 ? 'SITE' : 'SITES'}</span>
        </div>
      </header>

      <div className="studio-network-canvas">
        <div className="studio-network-grid" aria-hidden="true" />
        <div className="studio-network-backbone" aria-hidden="true">
          <span />
          <b>NETWORK CORE</b>
          <span />
        </div>

        {sitePortals.length ? (
          <div className="studio-network-sites">
            {sitePortals.map((site, index) => {
              const polygon = site.node.polygon ? normalizePolygon(site.node.polygon) : null;
              const selectedState = selected?.node.id === site.node.id;

              return (
                <article
                  key={site.node.id}
                  className={`studio-network-site${selectedState ? ' is-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${site.node.name}`}
                  onClick={() => setSelectedId(site.node.id)}
                  onDoubleClick={() => router.push(site.href)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(site.node.id);
                    }
                  }}
                  style={{ '--site-index': index } as CSSProperties}
                >
                  <div className="studio-network-site-map" aria-hidden="true">
                    {polygon ? (
                      <svg viewBox="0 0 216 116" preserveAspectRatio="xMidYMid meet">
                        <polygon points={polygon} />
                      </svg>
                    ) : (
                      <div className="studio-network-site-placeholder">
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    )}
                  </div>
                  <div className="studio-network-site-copy">
                    <small>SITE · {site.node.lifecycle}</small>
                    <strong>{site.node.name}</strong>
                    <span>
                      {site.node.polygon
                        ? `${site.node.polygon.length} boundary vertices`
                        : 'Boundary not defined'}
                    </span>
                  </div>
                  <Link href={site.href} onClick={(event) => event.stopPropagation()}>
                    Open site →
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="studio-network-empty">
            <strong>No Sites configured</strong>
            <span>Create a Site to begin the physical hierarchy.</span>
          </div>
        )}
      </div>

      {selected && (
        <footer className="studio-network-selection">
          <div>
            <small>SELECTED SITE</small>
            <strong>{selected.node.name}</strong>
          </div>
          <dl>
            <div>
              <dt>Lifecycle</dt>
              <dd>{selected.node.lifecycle}</dd>
            </div>
            <div>
              <dt>Boundary</dt>
              <dd>{selected.node.polygon ? 'DEFINED' : 'NOT DEFINED'}</dd>
            </div>
          </dl>
          <button type="button" onClick={() => router.push(selected.href)}>
            Enter physical Site →
          </button>
        </footer>
      )}
    </section>
  );
}
