import { requirePermission } from '@/modules/identity/application/current-session';
import { IndustrialCommissioningService } from '@/modules/industrial/application/commissioning-service';
import {
  parseProfileInput,
  parseConfirmChannel,
  parseRetireChannel,
} from '@/modules/industrial/domain/commissioning';
import { createCommunicationProfileRepository } from '@/modules/industrial/infrastructure/communication-profile-repository';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  isSafeMutationRequest,
  readBoundedJson,
  jsonBodyErrorStatus,
  hasOnlyKeys,
} from '@/shared/http/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function service() {
  return new IndustrialCommissioningService(
    await createTopologyRepository(),
    await createCommunicationProfileRepository(),
    await createTelemetryBindingRepository(),
  );
}

export async function GET(request: Request) {
  const permission = await requirePermission('settings:read');
  if (!permission.ok) return Response.json({ error: permission.error }, { status: 403 });
  const telemetry = await requirePermission('telemetry:read');
  if (!telemetry.ok) return Response.json({ error: telemetry.error }, { status: 403 });
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (deviceId && deviceId.length > 160)
    return Response.json({ error: 'INVALID_DEVICE_ID' }, { status: 400 });
  const app = await service();
  if (!deviceId)
    return Response.json(
      { bdfbs: await app.listBdfbs() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  const overview = await app.overview(deviceId);
  return overview.ok
    ? Response.json(overview.value, { headers: { 'Cache-Control': 'no-store' } })
    : Response.json({ error: overview.error }, { status: 404 });
}

export async function POST(request: Request) {
  const write = await requirePermission('settings:write');
  if (!write.ok) return Response.json({ error: write.error }, { status: 403 });
  const topologyWrite = await requirePermission('topology:write');
  if (!topologyWrite.ok) return Response.json({ error: topologyWrite.error }, { status: 403 });
  if (!isSafeMutationRequest(request))
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });

  const parsed = await readBoundedJson(request, { maxBytes: 4096, maxDepth: 8, maxNodes: 120 });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value))
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  const body = parsed.value as Record<string, unknown>;
  if (
    !hasOnlyKeys(body, ['action', 'input', 'expectedRevision']) ||
    typeof body.action !== 'string'
  )
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const app = await service();
  if (body.action === 'save-profile') {
    const input = parseProfileInput(body.input);
    if (
      !input ||
      !(
        body.expectedRevision === null ||
        (Number.isInteger(body.expectedRevision) && Number(body.expectedRevision) > 0)
      )
    )
      return Response.json({ error: 'INVALID_PROFILE' }, { status: 400 });
    const result = await app.saveProfile(
      input,
      write.value.id,
      body.expectedRevision as number | null,
    );
    return result.ok
      ? Response.json({ profile: result.value }, { status: 200 })
      : Response.json({ error: result.error }, { status: 409 });
  }
  if (body.expectedRevision !== undefined)
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  if (body.action === 'confirm-channel') {
    const input = parseConfirmChannel(body.input);
    if (!input) return Response.json({ error: 'CONFIRMATION_REQUIRED' }, { status: 400 });
    const result = await app.confirmChannel(input, write.value.id);
    return result.ok
      ? Response.json(result.value, { status: 201 })
      : Response.json({ error: result.error }, { status: 409 });
  }
  if (body.action === 'retire-channel') {
    const input = parseRetireChannel(body.input);
    if (!input)
      return Response.json({ error: 'RETIREMENT_CONFIRMATION_REQUIRED' }, { status: 400 });
    const result = await app.retireChannel(input, write.value.id);
    return result.ok
      ? Response.json(result.value)
      : Response.json({ error: result.error }, { status: 409 });
  }
  return Response.json({ error: 'INVALID_ACTION' }, { status: 400 });
}
