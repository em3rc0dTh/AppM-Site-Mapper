import { isAllowedParent } from '@/modules/topology/domain/hierarchy';
import type { ClientSession, Db } from 'mongodb';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { IntegrityConflict } from './integrity-transaction';

export async function requireActiveAncestry(
  db: Db,
  id: string,
  session: ClientSession,
): Promise<void> {
  const seen = new Set<string>();
  let cursor: string | null = id;
  while (cursor) {
    if (seen.has(cursor)) throw new IntegrityConflict('INVALID_PHYSICAL_REFERENCE');
    seen.add(cursor);
    const node: { readonly parentId?: string | null } | null = (await db
      .collection('topology_nodes')
      .findOne({ id: cursor, lifecycle: 'ACTIVE' }, { session })) as {
      readonly parentId?: string | null;
    } | null;
    if (!node) throw new IntegrityConflict('REFERENCE_NOT_ACTIVE');
    cursor = node.parentId ?? null;
  }
}

export async function guardTopologyWrite(
  db: Db,
  node: TopologyNode,
  session: ClientSession,
  previous?: TopologyNode,
): Promise<void> {
  const topology = db.collection('topology_nodes');
  const physicalParent = node.parentId
    ? await topology.findOne({ id: node.parentId }, { session })
    : null;
  if (!isAllowedParent(node.kind, physicalParent as unknown as TopologyNode | null))
    throw new IntegrityConflict('INVALID_PHYSICAL_REFERENCE');
  if (node.lifecycle === 'ACTIVE' && node.parentId)
    await requireActiveAncestry(db, node.parentId, session);
  if (
    node.kind === 'DEVICE' &&
    previous &&
    previous.parentId !== node.parentId &&
    (await topology.findOne(
      {
        kind: 'EQUIPMENT',
        deviceId: node.id,
        lifecycle: 'ACTIVE',
        rackPlacement: { $exists: true },
      },
      { session },
    ))
  )
    throw new IntegrityConflict('CAS_RELEASE_REQUIRED');
  if (node.kind === 'CONTAINER_RACK' && node.lifecycle === 'ACTIVE') {
    if (
      await topology.findOne(
        {
          kind: 'CONTAINER_RACK',
          lifecycle: 'ACTIVE',
          parentId: node.parentId,
          id: { $ne: node.id },
        },
        { session },
      )
    ) {
      throw new IntegrityConflict('POSITION_OCCUPIED');
    }
  }
  if (node.lifecycle === 'ARCHIVED') {
    if (await topology.findOne({ parentId: node.id, lifecycle: 'ACTIVE' }, { session }))
      throw new IntegrityConflict('HAS_ACTIVE_CHILDREN');
    if (node.kind === 'EQUIPMENT' && node.accessPorts.some((port) => port.lifecycle === 'ACTIVE'))
      throw new IntegrityConflict('ACTIVE_ACCESS_PORTS');
  }
  if (node.kind === 'EQUIPMENT') {
    const ids = new Set<string>();
    for (const port of node.accessPorts) {
      if (ids.has(port.id) || port.equipmentId !== node.id || port.deviceId !== node.deviceId)
        throw new IntegrityConflict('INVALID_ACCESS_PORT_REFERENCE');
      ids.add(port.id);
    }
    if (node.lifecycle === 'ACTIVE') {
      await requireActiveAncestry(db, node.deviceId, session);
      const parent = await topology.findOne({ id: node.parentId }, { session });
      if (
        !parent ||
        (node.parentEquipmentId === null
          ? parent.kind !== 'DEVICE' ||
            parent.id !== node.deviceId ||
            !parent.rootEquipmentIds?.includes(node.id)
          : parent.kind !== 'EQUIPMENT' ||
            parent.id !== node.parentEquipmentId ||
            parent.deviceId !== node.deviceId ||
            !parent.children?.includes(node.id))
      ) {
        throw new IntegrityConflict('INVALID_PHYSICAL_REFERENCE');
      }
      if (node.rackPlacement) {
        const rack = await topology.findOne(
          { id: node.rackPlacement.rackId, kind: 'CONTAINER_RACK', lifecycle: 'ACTIVE' },
          { session },
        );
        if (
          !rack ||
          !rack.cas?.some((range: { occupantId?: string }) => range.occupantId === node.id)
        )
          throw new IntegrityConflict('CAS_REFERENCE_CONFLICT');
      }
    }
    const removedPorts = (previous?.kind === 'EQUIPMENT' ? previous.accessPorts : [])
      .filter(
        (port: { id: string }) =>
          node.lifecycle !== 'ACTIVE' ||
          !node.accessPorts.some((next) => next.id === port.id && next.lifecycle === 'ACTIVE'),
      )
      .map((port: { id: string }) => port.id);
    if (removedPorts.length) {
      if (
        await db
          .collection('power_paths')
          .findOne(
            {
              lifecycle: 'ACTIVE',
              $or: [
                { sourceAccessPortId: { $in: removedPorts } },
                { targetAccessPortId: { $in: removedPorts } },
              ],
            },
            { session },
          )
      )
        throw new IntegrityConflict('ACTIVE_POWER_PATHS');
      if (
        await db
          .collection('telemetry_bindings')
          .findOne(
            { lifecycle: 'ACTIVE', targetType: 'ACCESS_PORT', targetId: { $in: removedPorts } },
            { session },
          )
      )
        throw new IntegrityConflict('ACTIVE_TELEMETRY_BINDINGS');
    }
  }
  if (node.kind === 'CONTAINER_RACK') {
    for (const range of node.cas) {
      if (!range.occupantId) continue;
      const occupant = await topology.findOne(
        {
          id: range.occupantId,
          kind: 'EQUIPMENT',
          lifecycle: 'ACTIVE',
          'rackPlacement.rackId': node.id,
        },
        { session },
      );
      if (node.lifecycle !== 'ACTIVE' || !occupant)
        throw new IntegrityConflict('CAS_REFERENCE_CONFLICT');
    }
  }
  if (previous?.lifecycle === 'ARCHIVED' && node.lifecycle === 'ACTIVE') {
    const children =
      node.kind === 'EQUIPMENT'
        ? node.children
        : node.kind === 'DEVICE'
          ? node.rootEquipmentIds
          : [];
    for (const id of children)
      if (id && !(await topology.findOne({ id, parentId: node.id }, { session })))
        throw new IntegrityConflict('INVALID_PHYSICAL_REFERENCE');
  }
  await guardExistingReferences(db, node, previous, session);
  if (
    node.lifecycle !== 'ACTIVE' &&
    (await db
      .collection('telemetry_bindings')
      .findOne(
        { lifecycle: 'ACTIVE', targetId: node.id, targetType: { $in: ['DEVICE', 'EQUIPMENT'] } },
        { session },
      ))
  )
    throw new IntegrityConflict('ACTIVE_TELEMETRY_BINDINGS');
}

/** Revalidate existing links against the final state, including changes of port
 * direction/feed or a commissioned panel's position/source identity. */
export async function guardExistingReferences(
  db: Db,
  node: TopologyNode,
  previous: TopologyNode | undefined,
  session: ClientSession,
): Promise<void> {
  const ports = [
    ...new Set([
      ...(node.kind === 'EQUIPMENT' ? node.accessPorts.map((port) => port.id) : []),
      ...(previous?.kind === 'EQUIPMENT' ? previous.accessPorts.map((port) => port.id) : []),
    ]),
  ];
  const topology = db.collection('topology_nodes');
  const resolvePort = async (id: string) => {
    const owner = await topology.findOne(
      {
        kind: 'EQUIPMENT',
        lifecycle: 'ACTIVE',
        accessPorts: { $elemMatch: { id, lifecycle: 'ACTIVE' } },
      },
      { session },
    );
    if (!owner) throw new IntegrityConflict('ACTIVE_REFERENCE_CONFLICT');
    await requireActiveAncestry(db, owner.id, session);
    return owner.accessPorts.find((port: { id: string }) => port.id === id);
  };
  const paths = await db
    .collection('power_paths')
    .find(
      {
        lifecycle: 'ACTIVE',
        $or: [{ sourceAccessPortId: { $in: ports } }, { targetAccessPortId: { $in: ports } }],
      },
      { session },
    )
    .toArray();
  for (const path of paths) {
    const source = await resolvePort(path.sourceAccessPortId);
    const target = await resolvePort(path.targetAccessPortId);
    if (
      source.portType !== 'POWER' ||
      target.portType !== 'POWER' ||
      source.exposure !== 'EXTERNAL' ||
      target.exposure !== 'EXTERNAL' ||
      source.direction === 'INPUT' ||
      target.direction === 'OUTPUT'
    )
      throw new IntegrityConflict('ACTIVE_POWER_PATHS');
    const a = source.attributes?.feed;
    const b = target.attributes?.feed;
    if ((a && b && a !== b) || (path.feed && ((a && a !== path.feed) || (b && b !== path.feed))))
      throw new IntegrityConflict('ACTIVE_POWER_PATHS');
  }
  const bindings = await db
    .collection('telemetry_bindings')
    .find(
      {
        lifecycle: 'ACTIVE',
        $or: [
          { targetId: node.id },
          { targetType: 'ACCESS_PORT', targetId: { $in: ports } },
          { 'attributes.panelId': node.id },
        ],
      },
      { session },
    )
    .toArray();
  for (const binding of bindings) {
    if (binding.targetType === 'ACCESS_PORT') await resolvePort(binding.targetId);
    else await requireActiveAncestry(db, binding.targetId, session);
    if (binding.attributes?.panelId) {
      const panel = await topology.findOne(
        { id: binding.attributes.panelId, lifecycle: 'ACTIVE', kind: 'EQUIPMENT' },
        { session },
      );
      const breaker = await topology.findOne(
        { id: binding.targetId, lifecycle: 'ACTIVE', kind: 'EQUIPMENT' },
        { session },
      );
      const position = binding.attributes.position;
      if (
        !panel ||
        !breaker ||
        typeof position !== 'number' ||
        panel.children?.[position - 1] !== breaker.id ||
        breaker.parentEquipmentId !== panel.id ||
        breaker.deviceId !== panel.deviceId ||
        panel.serialNumber !== binding.sourceIdentity ||
        `${panel.telemetryPointPrefix}_${position}` !== binding.sourcePointId
      )
        throw new IntegrityConflict('COMMISSIONING_TOPOLOGY_CONFLICT');
    }
  }
}
