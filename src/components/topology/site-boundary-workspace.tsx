'use client';

import { useState, type ReactNode } from 'react';
import type { SiteNode } from '@/modules/topology/domain/entities';
import type { PointMm } from '@/modules/spatial/domain/geometry';
import { PolygonEditor } from '@/components/spatial/polygon-editor';

export function SiteBoundaryWorkspace({ node, canWrite, children }: { node: SiteNode; canWrite: boolean; children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(polygon: PointMm[]) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/spatial/sites/${node.id}/boundary`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polygon, version: node.updatedAt }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error === 'BOUNDARY_CONFLICT' ? 'This Site changed. Cancel and reload before editing again.' : result.error ?? 'SAVE_FAILED');
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'SAVE_FAILED'); setBusy(false); }
  }
  return <div className="spatial-site-workspace">
    {editing ? <PolygonEditor title={`EDIT SITE BOUNDARY · ${node.name}`} initial={node.polygon ?? []}
      onConfirm={(polygon) => void save(polygon)} onCancel={() => { setEditing(false); setError(null); }} busy={busy} error={error} /> : <>
      {canWrite && node.lifecycle === 'ACTIVE' && <div className="spatial-site-actions"><button type="button" onClick={() => setEditing(true)}>{node.polygon?.length ? 'EDIT BOUNDARY' : 'DRAW BOUNDARY'}</button></div>}
      {children}
    </>}
  </div>;
}
