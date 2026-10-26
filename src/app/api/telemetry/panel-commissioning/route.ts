import { readBoundedJson as readHardenedJson, jsonBodyErrorStatus as hardenedJsonStatus, isSafeMutationRequest as hardenedSafeMutation } from '@/shared/http/request-security';
import { integrityErrorResponse } from '@/shared/http/integrity-error';
import { randomUUID } from 'node:crypto';

import { requirePermission } from '@/modules/identity/application/current-session';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  normalizedTelemetryPointPrefix,
  rawPointForPosition,
} from '@/modules/topology/domain/telemetry-point-prefix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METRICS = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'] as const;

async function inspect(panelId: string) {
  const topology = await createTopologyRepository();
  const panel = await topology.getById(panelId);
  if (
    !panel ||
    panel.kind !== 'EQUIPMENT' ||
    panel.lifecycle !== 'ACTIVE' ||
    panel.equipmentType !== 'PANEL' ||
    panel.childMode !== 'POSITIONAL' ||
    !panel.telemetryPointPrefix ||
    !panel.serialNumber
  )
    return null;
  const prefix = normalizedTelemetryPointPrefix(panel.telemetryPointPrefix);
  if (!prefix) return null;
  const repository = await createTelemetryBindingRepository();
  const sourceBindings = await repository.listForSource('MQTT', panel.serialNumber);
  const rows = [];
  for (let i = 0; i < panel.children.length; i++) {
    const id = panel.children[i];
    if (!id) continue;
    const breaker = await topology.getById(id);
    if (
      !breaker ||
      breaker.kind !== 'EQUIPMENT' ||
      breaker.equipmentType !== 'CIRCUIT_BREAKER' ||
      breaker.lifecycle !== 'ACTIVE' ||
      breaker.parentEquipmentId !== panel.id ||
      breaker.deviceId !== panel.deviceId
    )
      continue;
    const point = rawPointForPosition(prefix, i + 1)!;
    const existing = await repository.listForTarget('EQUIPMENT', id);
    const foreign = existing.filter(
      (b) =>
        b.protocol === 'MQTT' &&
        (b.sourceIdentity !== panel.serialNumber || (b.sourcePointId && b.sourcePointId !== point)),
    );
    const conflictingPoints = sourceBindings.filter(
      (b) => b.sourcePointId === point && b.targetType === 'EQUIPMENT' && b.targetId !== id,
    );
    const current = existing.filter(
      (b) =>
        b.protocol === 'MQTT' &&
        b.sourceIdentity === panel.serialNumber &&
        b.sourcePointId === point &&
        METRICS.includes(b.metric as (typeof METRICS)[number]),
    );
    rows.push({
      position: i + 1,
      breakerId: id,
      breakerName: breaker.name,
      point,
      existingMetrics: current.map((b) => b.metric),
      conflictingOwnSources: foreign
        .filter((b) => !b.sourcePointId && b.metric.toUpperCase() === 'SOURCE')
        .map((b) => ({ id: b.id, source: b.sourceIdentity })),
      conflicts: [
        ...foreign.map((b) => `Existing ${b.metric} source ${b.sourceIdentity}`),
        ...conflictingPoints.map((b) => `Point assigned to ${b.targetId}`),
      ],
      ready: !foreign.length && !conflictingPoints.length && current.length === 4,
    });
  }
  return {
    panelId: panel.id,
    sourceIdentity: panel.serialNumber,
    pointPrefix: prefix,
    capacity: panel.children.length,
    rows,
  };
}

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const panelId = new URL(request.url).searchParams.get('panelId');
  if (!panelId) return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  const preview = await inspect(panelId);
  return preview
    ? Response.json(preview)
    : Response.json({ error: 'PANEL_NOT_COMMISSIONABLE' }, { status: 404 });
}

async function handlePOST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });
  if (!hardenedSafeMutation(request)) return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsedBody = await readHardenedJson(request);
  if (!parsedBody.ok) return Response.json({ error: parsedBody.error }, { status: hardenedJsonStatus(parsedBody.error) });
  const body: unknown = parsedBody.value;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  const payload = body as Record<string, unknown>;
  if (
    typeof payload.panelId !== 'string' ||
    typeof payload.breakerId !== 'string' ||
    payload.confirmPoint !== true ||
    typeof payload.confirmSource !== 'string' ||
    typeof payload.confirmRawPoint !== 'string'
  )
    return Response.json({ error: 'CONFIRMATION_REQUIRED' }, { status: 400 });
  const preview = await inspect(payload.panelId);
  if (!preview) return Response.json({ error: 'PANEL_NOT_COMMISSIONABLE' }, { status: 404 });
  const row = preview.rows.find((r) => r.breakerId === payload.breakerId);
  if (
    !row ||
    payload.confirmSource !== preview.sourceIdentity ||
    payload.confirmRawPoint !== row.point
  )
    return Response.json({ error: 'CONFIRMATION_MISMATCH' }, { status: 409 });
  if (payload.action === 'retire-own-source') {
    if (payload.confirmRetirement !== true || typeof payload.bindingId !== 'string') {
      return Response.json({ error: 'RETIREMENT_CONFIRMATION_REQUIRED' }, { status: 400 });
    }
    const repository = await createTelemetryBindingRepository();
    const bindings = await repository.listForTarget('EQUIPMENT', row.breakerId);
    const existing = bindings.find(
      (b) =>
        b.id === payload.bindingId &&
        b.lifecycle === 'ACTIVE' &&
        b.protocol === 'MQTT' &&
        !b.sourcePointId &&
        b.metric.toUpperCase() === 'SOURCE' &&
        b.sourceIdentity !== preview.sourceIdentity,
    );
    if (!existing || payload.retiredSource !== existing.sourceIdentity)
      return Response.json({ error: 'RETIREMENT_BINDING_MISMATCH' }, { status: 409 });
    await repository.replace({
      ...existing,
      lifecycle: 'ARCHIVED',
      updatedAt: new Date().toISOString(),
      attributes: {
        ...existing.attributes,
        retiredForPanel: preview.panelId,
        retirementReason: 'EXPLICIT_PANEL_COMMISSIONING',
      },
    });
    return Response.json({ ok: true, retired: existing.id, preservedSerial: true });
  }
  if (row.conflicts.length)
    return Response.json(
      { error: 'EXISTING_BINDING_CONFLICT', conflicts: row.conflicts },
      { status: 409 },
    );
  const repository = await createTelemetryBindingRepository();
  const now = new Date().toISOString();
  if (!repository.commitBindings) return Response.json({ error: 'ATOMIC_COMMISSIONING_STORAGE_REQUIRED' }, { status: 503 });
  const topology = await createTopologyRepository();
  const panel = await topology.getById(preview.panelId);
  const breaker = await topology.getById(row.breakerId);
  if (!panel || !breaker) return Response.json({ error: 'COMMISSIONING_TOPOLOGY_CONFLICT' }, { status: 409 });
  const bindings: TelemetryBinding[] = METRICS.map((metric) => ({
    id: randomUUID(), lifecycle: 'ACTIVE', createdAt: now, updatedAt: now,
    protocol: 'MQTT', sourceIdentity: preview.sourceIdentity, sourcePointId: row.point,
    metric, targetType: 'EQUIPMENT', targetId: row.breakerId,
    attributes: {
      commissioning: 'EXPLICIT_OPERATOR_CONFIRMATION',
      measurementSource: 'PANEL_POSITION',
      sourceEquipmentId: preview.panelId,
      observedEquipmentId: row.breakerId,
      panelId: preview.panelId,
      position: row.position,
    },
  }));
  const ids = await repository.commitBindings(bindings, [panel, breaker]);
  return Response.json({ ok: true, breakerId: row.breakerId, point: row.point,
    created: bindings.filter((binding) => ids.includes(binding.id)).map((binding) => binding.metric) });
}

export async function POST(request: Request) {
  try { return await handlePOST(request); } catch (error) { return integrityErrorResponse(error); }
}
