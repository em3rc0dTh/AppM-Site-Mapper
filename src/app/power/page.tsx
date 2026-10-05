import { redirect } from 'next/navigation';

import { PowerPathView, type PowerStage } from '@/components/power/power-path-view';
import { requirePermission } from '@/modules/identity/application/current-session';
import { resolvePowerEndpoint } from '@/modules/power/domain/endpoint-validation';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { MetricTile, SectionHeader, StatePanel } from '@/shared/ui/primitives';

export default async function PowerPage() {
  const auth = await requirePermission('power:read');
  if (!auth.ok) redirect('/login');

  const paths = await (await createPowerRepository()).listActive();
  const topology = await createTopologyRepository();

  async function stagesFor(accessPortId: string): Promise<PowerStage[]> {
    const resolved = await resolvePowerEndpoint(topology, accessPortId);
    if (!resolved) return [{ id: accessPortId, kind: 'ACCESS_PORT', name: accessPortId }];

    const equipmentTrail: EquipmentNode[] = [];
    let current: EquipmentNode | null = resolved.equipment;
    const visited = new Set<string>();

    while (current) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      equipmentTrail.push(current);
      if (!current.parentEquipmentId) break;
      const parent = await topology.getById(current.parentEquipmentId);
      current = parent?.kind === 'EQUIPMENT' ? parent : null;
    }

    const device = await topology.getById(resolved.equipment.deviceId);
    return [
      ...(device?.kind === 'DEVICE' ? [{ id: device.id, kind: 'DEVICE', name: device.name }] : []),
      ...equipmentTrail.reverse().map((equipment) => ({
        id: equipment.id,
        kind: equipment.equipmentType,
        name: equipment.name,
      })),
      { id: resolved.port.id, kind: 'ACCESS_PORT', name: resolved.port.name },
    ];
  }

  const views = await Promise.all(
    paths.map(async (path) => {
      const [source, target] = await Promise.all([
        stagesFor(path.sourceAccessPortId),
        stagesFor(path.targetAccessPortId),
      ]);
      return { path, stages: [...source, ...target.reverse()] };
    }),
  );

  return (
    <main>
      <SectionHeader
        eyebrow="Electrical / distribution"
        title="Power Paths"
        description="Trace configured AccessPort-to-AccessPort electrical relationships."
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
