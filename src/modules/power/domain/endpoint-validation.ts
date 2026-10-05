import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { AccessPort, EquipmentNode } from '@/modules/topology/domain/entities';

export interface ResolvedPowerEndpoint {
  readonly equipment: EquipmentNode;
  readonly port: AccessPort;
}

export async function resolvePowerEndpoint(
  topology: TopologyRepository,
  accessPortId: string,
): Promise<ResolvedPowerEndpoint | null> {
  const equipment = await topology.getEquipmentByAccessPortId(accessPortId);
  if (!equipment || equipment.lifecycle !== 'ACTIVE') return null;

  const port = equipment.accessPorts.find(
    (candidate) => candidate.id === accessPortId && candidate.lifecycle === 'ACTIVE',
  );
  if (!port || port.portType !== 'POWER') return null;

  return { equipment, port };
}
