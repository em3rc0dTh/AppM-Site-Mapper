import { authorizeController } from '@/modules/telemetry/application/snmp-ingest-credentials';
import { reserveSnmpIngressQuota } from '@/modules/telemetry/application/snmp-ingest-rate-limit';
import { captureIndustrial } from '@/modules/telemetry/infrastructure/industrial/runtime';
import { readBoundedJson, jsonBodyErrorStatus } from '@/shared/http/request-security';
import { IndustrialInputError } from '@/modules/telemetry/domain/industrial/observations';
import type { Envelope } from '@/modules/telemetry/domain/industrial/observations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  let source: string | null;
  try {
    source = authorizeController(
      request.headers.get('authorization'),
      process.env.INDUSTRIAL_INGEST_SOURCES_JSON,
    );
  } catch {
    return Response.json({ error: 'INVALID_SOURCE_CREDENTIALS' }, { status: 503 });
  }
  if (!source) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    if (!(await reserveSnmpIngressQuota(source)))
      return Response.json(
        { error: 'QUOTA_EXCEEDED' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
  } catch {
    return Response.json({ error: 'QUOTA_UNAVAILABLE' }, { status: 503 });
  }
  const parsed = await readBoundedJson(request, {
    maxBytes: 262144,
    maxDepth: 18,
    maxNodes: 16000,
  });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  const body = parsed.value as Partial<Envelope> | null;
  if (
    !body ||
    typeof body !== 'object' ||
    body.sourceIdentity !== source ||
    body.protocol !== 'SNMP' ||
    !['trap', 'inform', 'get', 'getnext', 'getbulk'].includes(String(body.transport)) ||
    (body.receivedAt !== undefined &&
      (typeof body.receivedAt !== 'string' ||
        !Number.isFinite(Date.parse(body.receivedAt)) ||
        Date.parse(body.receivedAt) > Date.now() + 60000)) ||
    (body.observedAt !== undefined && typeof body.observedAt !== 'string') ||
    (body.messageId !== undefined &&
      (typeof body.messageId !== 'string' || body.messageId.length > 512)) ||
    (body.origin !== undefined && (typeof body.origin !== 'string' || body.origin.length > 128)) ||
    (body.notificationOid !== undefined && typeof body.notificationOid !== 'string')
  )
    return Response.json({ error: 'INVALID_SOURCE_ENVELOPE' }, { status: 400 });
  try {
    const result = await captureIndustrial({
      protocol: 'SNMP',
      sourceIdentity: source,
      transport: body.transport!,
      raw: body.raw,
      receivedAt: body.receivedAt ?? new Date().toISOString(),
      ...(body.observedAt ? { observedAt: body.observedAt } : {}),
      ...(body.messageId ? { messageId: body.messageId } : {}),
      ...(body.origin ? { origin: body.origin } : {}),
      ...(body.notificationOid ? { notificationOid: body.notificationOid } : {}),
    });
    return Response.json(
      {
        eventId: result.batch.id,
        disposition: result.disposition,
        signals: result.batch.signals.length,
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    // No original payload, credentials or network details in public error responses.
    return Response.json(
      { error: 'CAPTURE_REJECTED_OR_UNAVAILABLE' },
      { status: error instanceof IndustrialInputError ? 422 : 503 },
    );
  }
}
