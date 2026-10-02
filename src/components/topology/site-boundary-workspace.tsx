'use client';

import { useState, type ReactNode } from 'react';

import { PolygonEditor } from '@/components/spatial/polygon-editor';
import { polygonInsidePolygon, type PointMm } from '@/modules/spatial/domain/geometry';
import type { SiteNode, StructureNode } from '@/modules/topology/domain/entities';

type BoundaryNode = SiteNode | StructureNode;

export function SiteBoundaryWorkspace({
  node,
  canWrite,
  context = [],
  children,
}: {
  node: BoundaryNode;
  canWrite: boolean;
  context?: readonly PointMm[];
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = node.kind === 'SITE' ? 'SITE' : 'STRUCTURE';
  const resource = node.kind === 'SITE' ? 'sites' : 'structures';

  async function save(polygon: PointMm[]) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/spatial/${resource}/${node.id}/boundary`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polygon, version: node.updatedAt }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        const conflict =
          result.error === 'BOUNDARY_CONFLICT'
            ? `This ${label.toLowerCase()} changed. Cancel and reload before editing again.`
            : result.error;
        throw new Error(conflict ?? 'SAVE_FAILED');
      }

      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SAVE_FAILED');
      setBusy(false);
    }
  }

  return (
    <div className="spatial-site-workspace">
      {editing ? (
        <PolygonEditor
          title={`${node.polygon?.length ? 'EDIT' : 'DRAW'} ${label} BOUNDARY · ${node.name}`}
          initial={node.polygon ?? []}
          context={context}
          {...(node.kind === 'STRUCTURE' && context.length >= 3
            ? {
                validate: (polygon: readonly PointMm[]) =>
                  polygonInsidePolygon(polygon, context)
                    ? null
                    : 'Structure boundary must remain inside the Site boundary.',
              }
            : {})}
          onConfirm={(polygon) => void save(polygon)}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
          busy={busy}
          error={error}
        />
      ) : (
        <>
          {canWrite && node.lifecycle === 'ACTIVE' && (
            <div className="spatial-site-actions">
              <button type="button" onClick={() => setEditing(true)}>
                {node.polygon?.length ? 'EDIT BOUNDARY' : 'DRAW BOUNDARY'}
              </button>
            </div>
          )}
          {children}
        </>
      )}
    </div>
  );
}
