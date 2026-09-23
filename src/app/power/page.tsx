import { redirect } from 'next/navigation';
import { PowerPathView, type PowerStage } from '@/components/power/power-path-view';
import { requirePermission } from '@/modules/identity/application/current-session';
import type { PowerEndpoint } from '@/modules/power/domain/entities';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { MetricTile, SectionHeader, StatePanel } from '@/shared/ui/primitives';

export default async function PowerPage() {
  const auth = await requirePermission('power:read');
  if (!auth.ok) redirect('/login');
  const paths = await (await createPowerRepository()).listActive();
  const topology = await createTopologyRepository();
  async function stagesFor(endpoint: PowerEndpoint): Promise<PowerStage[]> {
    const node = await topology.getById(endpoint.entityId);
    const result = [
      {
        id: endpoint.entityId,
        kind: node?.kind ?? 'ENTITY',
        name: node?.name ?? endpoint.entityId,
      },
    ];
    const internal = endpoint.internal;
    if (!internal) return result;
    const shelf =
      node?.kind === 'DEVICE'
        ? node.bdfb?.shelves.find((item) => item.id === internal.shelfId)
        : undefined;
    const frame = shelf?.frames.find((item) => item.id === internal.frameId);
    const panel = frame?.panels.find((item) => item.id === internal.panelId);
    const breaker = panel?.endpoints.find((item) => item.id === internal.breakerHolderId);
    if (internal.shelfId)
      result.push({ id: internal.shelfId, kind: 'SHELF', name: shelf?.label ?? internal.shelfId });
    if (internal.frameId)
      result.push({ id: internal.frameId, kind: 'FRAME', name: frame?.label ?? internal.frameId });
    if (internal.panelId)
      result.push({ id: internal.panelId, kind: 'PANEL', name: panel?.label ?? internal.panelId });
    if (internal.breakerHolderId)
      result.push({
        id: internal.breakerHolderId,
        kind: breaker?.variant ?? 'BREAKER / HOLDER',
        name: breaker?.label ?? internal.breakerHolderId,
      });
    return result;
  }
  const views = await Promise.all(
    paths.map(async (path) => {
      const [source, target] = await Promise.all([stagesFor(path.source), stagesFor(path.target)]);
      return { path, stages: [...source, ...target.reverse()] };
    }),
  );
  return (
    <main>
      <SectionHeader
        eyebrow="Electrical / distribution"
        title="Power Paths"
        description="Trace configured sources, distribution endpoints and connected inventory."
      />
      <div className="metric-grid">
        <MetricTile label="Active paths" value={paths.length} detail="Configured relationships" />
        <MetricTile label="Feed A" value={paths.filter((path) => path.feed === 'A').length} />
        <MetricTile label="Feed B" value={paths.filter((path) => path.feed === 'B').length} />
        <MetricTile label="Unspecified feed" value={paths.filter((path) => !path.feed).length} />
      </div>
      {!paths.length ? (
        <StatePanel
          title="No active power paths"
          description="Configured electrical relationships will appear here as source-to-target paths."
        />
      ) : (
        views.map(({ path, stages }) => (
          <PowerPathView
            key={path.id}
            label={path.label ?? path.id}
            feed={path.feed ?? ''}
            stages={stages}
          />
        ))
      )}
    </main>
  );
}
