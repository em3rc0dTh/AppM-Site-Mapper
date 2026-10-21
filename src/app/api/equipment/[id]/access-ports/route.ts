import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import {
  AccessPortService,
  type AccessPortInput,
  type AccessPortError,
} from '@/modules/topology/application/access-port-service';
import type { AccessPort, EquipmentNode } from '@/modules/topology/domain/entities';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import {
  hasOnlyKeys,
  isBoundedString,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

type Context = Readonly<{ params: Promise<{ id: string }> }>;
const types = ['POWER', 'NETWORK', 'CONTROL', 'DATA', 'GROUND', 'CUSTOM'];
const directions = ['INPUT', 'OUTPUT', 'BIDIRECTIONAL'];
const exposures = ['INTERNAL', 'EXTERNAL'];
const portKeys = [
  'name',
  'portType',
  'direction',
  'exposure',
  'connectorType',
  'protocol',
  'customType',
  'feed',
  'feedPosition',
  'overloadThresholdA',
  'snmpFeedInput',
  'independentInputConfirmed',
  'ratedCurrentA',
  'shuntRatedCurrentA',
  'shuntRatedMillivolts',
  'servedPanelIds',
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validPort(value: unknown): value is AccessPortInput {
  const port = record(value);
  if (!port || !hasOnlyKeys(port, portKeys)) return false;
  return (
    isBoundedString(port.name, 120) &&
    types.includes(port.portType as string) &&
    directions.includes(port.direction as string) &&
    exposures.includes(port.exposure as string) &&
    (port.connectorType === undefined ||
      isBoundedString(port.connectorType, 120, { allowEmpty: true })) &&
    (port.protocol === undefined || isBoundedString(port.protocol, 120, { allowEmpty: true })) &&
    (port.customType === undefined ||
      isBoundedString(port.customType, 120, { allowEmpty: true })) &&
    (port.feed === undefined ||
      (port.portType === 'POWER' && (port.feed === 'A' || port.feed === 'B'))) &&
    (port.feedPosition === undefined ||
      (port.feedPosition === 'A1' || port.feedPosition === 'A2' ||
        port.feedPosition === 'B1' || port.feedPosition === 'B2')) &&
    (port.overloadThresholdA === undefined ||
      (typeof port.overloadThresholdA === 'number' &&
        Number.isFinite(port.overloadThresholdA) &&
        port.overloadThresholdA > 0 && port.overloadThresholdA <= 100_000)) &&
    (port.snmpFeedInput === undefined || typeof port.snmpFeedInput === 'boolean') &&
    (port.independentInputConfirmed === undefined ||
      typeof port.independentInputConfirmed === 'boolean') &&
    ['ratedCurrentA', 'shuntRatedCurrentA', 'shuntRatedMillivolts'].every(
      (key) =>
        port[key] === undefined ||
        (typeof port[key] === 'number' &&
          Number.isFinite(port[key]) &&
          (port[key] as number) > 0 &&
          (port[key] as number) <= 100_000),
    ) &&
    (port.servedPanelIds === undefined ||
      (Array.isArray(port.servedPanelIds) &&
        port.servedPanelIds.length <= 24 &&
        port.servedPanelIds.every((x) => typeof x === 'string' && x.length <= 160)))
  );
}

function errorStatus(error: AccessPortError): number {
  if (error === 'NOT_FOUND' || error === 'PORT_NOT_FOUND' || error === 'NOT_EQUIPMENT') return 404;
  if (['PORT_IN_USE', 'PORT_NAME_CONFLICT', 'LAYOUT_CONFLICT', 'DUPLICATE_FEED_POSITION'].includes(error)) return 409;
  return 422;
}

async function buildService() {
  const topology = await createTopologyRepository();
  const power = await createPowerRepository();
  return {
    topology,
    service: new AccessPortService(topology, power, await createTelemetryBindingRepository()),
  };
}

async function readMutation(request: Request) {
  if (!isSafeMutationRequest(request)) {
    return {
      response: NextResponse.json({ error: 'CROSS_SITE_MUTATION_REJECTED' }, { status: 403 }),
    };
  }
  const parsed = await readBoundedJson(request, { maxBytes: 8192, maxDepth: 4, maxNodes: 64 });
  if (!parsed.ok) {
    return {
      response: NextResponse.json(
        { error: parsed.error },
        { status: jsonBodyErrorStatus(parsed.error) },
      ),
    };
  }
  return { body: record(parsed.value) };
}

async function authorizePortMutation(
  newPort: AccessPortInput | undefined,
  existing: AccessPort | undefined,
) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (newPort?.portType === 'POWER' || existing?.portType === 'POWER') {
    const powerAuth = await requirePermission('power:write');
    if (!powerAuth.ok) return NextResponse.json({ error: powerAuth.error }, { status: 403 });
  }
  return null;
}

export async function GET(_request: Request, context: Context) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { id } = await context.params;
  const { service } = await buildService();
  const result = await service.list(id);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  return NextResponse.json({ accessPorts: result.value });
}

export async function POST(request: Request, context: Context) {
  const payload = await readMutation(request);
  if ('response' in payload) return payload.response;
  if (!payload.body || !hasOnlyKeys(payload.body, ['port']) || !validPort(payload.body.port))
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const denied = await authorizePortMutation(payload.body.port, undefined);
  if (denied) return denied;
  const { id } = await context.params;
  const { service } = await buildService();
  const result = await service.upsert(id, payload.body.port);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  return NextResponse.json({ port: result.value }, { status: 201 });
}

export async function PATCH(request: Request, context: Context) {
  const payload = await readMutation(request);
  if ('response' in payload) return payload.response;
  if (
    !payload.body ||
    !hasOnlyKeys(payload.body, ['portId', 'port']) ||
    !isBoundedString(payload.body.portId, 160) ||
    !validPort(payload.body.port)
  )
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const { id } = await context.params;
  const { topology, service } = await buildService();
  const node = await topology.getById(id);
  const existing =
    node?.kind === 'EQUIPMENT'
      ? node.accessPorts.find(
          (port) => port.id === payload.body!.portId && port.lifecycle === 'ACTIVE',
        )
      : undefined;
  const denied = await authorizePortMutation(payload.body.port, existing);
  if (denied) return denied;
  const result = await service.upsert(id, payload.body.port, payload.body.portId as string);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  return NextResponse.json({ port: result.value });
}

export async function DELETE(request: Request, context: Context) {
  const payload = await readMutation(request);
  if ('response' in payload) return payload.response;
  if (
    !payload.body ||
    !hasOnlyKeys(payload.body, ['portId']) ||
    !isBoundedString(payload.body.portId, 160)
  )
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const { id } = await context.params;
  const { topology, service } = await buildService();
  const node = await topology.getById(id);
  const existing =
    node?.kind === 'EQUIPMENT'
      ? node.accessPorts.find(
          (port) => port.id === payload.body!.portId && port.lifecycle === 'ACTIVE',
        )
      : undefined;
  const denied = await authorizePortMutation(undefined, existing);
  if (denied) return denied;
  const result = await service.archive(id, payload.body.portId as string);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  return NextResponse.json({ port: result.value });
}
