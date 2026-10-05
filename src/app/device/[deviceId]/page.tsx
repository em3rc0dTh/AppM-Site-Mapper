import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { FullPowerTraceModal } from '@/components/power/full-power-trace-modal';
import { PowerContractEditor } from '@/components/power/power-contract-editor';
import { RackElevation } from '@/components/rack/rack-elevation';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { TopologyContextTree } from '@/components/topology/context-tree';
import { ContextPin } from '@/components/workspace/context-pin';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { PowerContractService } from '@/modules/inventory/application/power-contract-service';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function DevicePage({ params }: { params: Promise<{ deviceId: string }> }) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const canWritePower = hasPermission(auth.value.role, 'power:write');
  const { deviceId } = await params;
  const repo = await createTopologyRepository();
  const service = new TopologyService(repo);
  const node = await repo.getById(deviceId);
  if (
    !node ||
    (node.kind !== 'DEVICE' && node.kind !== 'EQUIPMENT') ||
    node.lifecycle !== 'ACTIVE'
  ) {
    notFound();
  }

  if (node.kind === 'DEVICE' && node.deviceType === 'BDFB') {
    redirect(await service.buildDeepLink(node.id));
  }

  const owningDeviceId = node.kind === 'DEVICE' ? node.id : node.deviceId;
  const deviceEquipment = (await repo.listEquipmentForDevice(owningDeviceId)).filter(
    (item) => item.lifecycle === 'ACTIVE',
  );
  const familyEquipment: readonly EquipmentNode[] =
    node.kind === 'DEVICE'
      ? deviceEquipment
      : deviceEquipment.filter((item) => {
          let current: EquipmentNode | undefined = item;
          const byId = new Map(deviceEquipment.map((candidate) => [candidate.id, candidate]));
          const visited = new Set<string>();
          while (current && !visited.has(current.id)) {
            if (current.id === node.id) return true;
            visited.add(current.id);
            current = current.parentEquipmentId
              ? byId.get(current.parentEquipmentId)
              : undefined;
          }
          return false;
        });

  const physical =
    node.kind === 'EQUIPMENT' && node.rackPlacement
      ? node
      : familyEquipment.find((item) => item.rackPlacement);
  const rack =
    physical?.rackPlacement
      ? await repo.getById(physical.rackPlacement.rackId)
      : null;
  const rackNode = rack?.kind === 'CONTAINER_RACK' ? rack : null;
  const contextTrail = rackNode
    ? await service.getTrail(rackNode.id)
    : await service.getTrail(node.id);
  const room = contextTrail.find((item) => item.kind === 'ROOM_SUBSTRUCTURE');
  const nodeTrail = await service.getTrail(node.id);
  const tree = nodeTrail[0] ? await service.buildNavigationTree(nodeTrail[0].id) : null;
  const view = rackNode ? await new RackElevationService(repo).getView(rackNode.id) : null;

  const familyPortIds = new Set(
    familyEquipment.flatMap((item) =>
      item.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').map((port) => port.id),
    ),
  );
  const relatedPower = (await (await createPowerRepository()).listActive()).filter(
    (path) =>
      familyPortIds.has(path.sourceAccessPortId) || familyPortIds.has(path.targetAccessPortId),
  );
  const hasFeedA = relatedPower.some((path) => path.feed === 'A');
  const hasFeedB = relatedPower.some((path) => path.feed === 'B');
  const contract = await new PowerContractService(repo).get(node.id);

  const placement = physical?.rackPlacement;
  const mountLabel =
    placement?.mode === 'U_RANGE' &&
    placement.startU !== undefined &&
    placement.sizeU !== undefined
      ? `U${placement.startU} – U${placement.startU + placement.sizeU - 1}`
      : placement?.mode === 'FULL_RACK'
        ? 'Full rack'
        : 'Not mounted';

  const links = await Promise.all(
    nodeTrail.map(async (item) => ({
      id: item.id,
      name: item.name,
      href: await service.buildDeepLink(item.id),
    })),
  );

  return (
    <main className="operational-page mk-device-page">
      <nav className="breadcrumbs zip-device-breadcrumbs">
        {rackNode ? (
          <Link href={`/rack/${rackNode.id}/focus`}>← {rackNode.name}</Link>
        ) : links[0] ? (
          <Link href={links[0].href}>← {links[0].name}</Link>
        ) : null}
        <span className="zip-breadcrumb-divider" />
        <strong>{node.name}</strong>
      </nav>

      <div className="mk-device-layout">
        <aside>{tree && <TopologyContextTree tree={tree} activeId={node.id} />}</aside>

        <section className="zip-device-stage">
          <h1>ELEVATION</h1>
          {view?.ok ? (
            <RackElevation view={view.value} focusDeviceId={physical?.id ?? node.id} />
          ) : (
            <p>This inventory is not placed in a rack.</p>
          )}
        </section>

        <aside className="mk-inline-inspector zip-device-inspector">
          <header>
            {node.kind} <span>⌄</span>
          </header>
          <div className="zip-device-identity">
            <span>▥</span>
            <div>
              <h2>{node.name}</h2>
              <small>
                {room?.name ?? 'Room'} / {rackNode?.name ?? 'Rack'} / {mountLabel}
              </small>
            </div>
          </div>

          <ContextPin entityId={node.id} />

          <dl>
            <dt>Identity</dt>
            <dd>{node.name}</dd>
            <dt>Model</dt>
            <dd>{node.kind === 'EQUIPMENT' ? node.model ?? node.category ?? 'Not specified' : node.category ?? 'Not specified'}</dd>
            <dt>Serial N.</dt>
            <dd>{node.serialNumber ?? 'Not assigned'}</dd>
            <dt>Rack</dt>
            <dd>{rackNode?.name ?? 'Not placed'}</dd>
            <dt>Placement</dt>
            <dd>
              {rackNode?.name ?? 'Not placed'} {mountLabel !== 'Not mounted' ? ` ${mountLabel}` : ''}
            </dd>
            <dt>Power A</dt>
            <dd>{hasFeedA ? 'Path recorded' : 'No recorded path'}</dd>
            <dt>Power B</dt>
            <dd>{hasFeedB ? 'Path recorded' : 'No recorded path'}</dd>
            <dt>Telemetry</dt>
            <dd>Open diagnostic to verify mapped LIVE readings</dd>
          </dl>

          <FullPowerTraceModal entityId={node.id} />

          {canWritePower && contract.ok ? (
            <PowerContractEditor
              entityId={node.id}
              accessPorts={contract.value.accessPorts}
              redundancy={contract.value.redundancy}
            />
          ) : null}

          {!relatedPower.length ? (
            <p className="device-power-unconfigured">
              No direct PowerPath is recorded for this inventory item. The full trace also checks
              recursively nested Equipment.
            </p>
          ) : null}

          <div className="zip-device-live">
            <TelemetryLens entityIds={[node.id]} label={node.name} />
          </div>

          {room && rackNode ? (
            <Link
              className="zip-device-outline"
              href={`/blueprint/${room.id}?rack=${rackNode.id}`}
            >
              ▣ LOCATE IN ROOM
            </Link>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
