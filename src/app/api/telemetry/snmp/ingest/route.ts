import { isProductionDeployment } from '@/config/env';
import { authorizeController } from '@/modules/telemetry/application/snmp-ingest-credentials';
import { createHash, timingSafeEqual } from 'node:crypto';

import { SnmpFeedService } from '@/modules/telemetry/application/snmp-feed-service';
import { parseSnmpFeedPacket } from '@/modules/telemetry/domain/snmp-feed';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { readBoundedJson, jsonBodyErrorStatus } from '@/shared/http/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** No cookie fallback. Endpoint stays disabled when the shared collector secret is absent. */
export function authorizedSnmpCollector(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length < 32 || !authorization?.startsWith('Bearer ')) return false;
  const supplied = authorization.slice(7);
  const actual = createHash('sha256').update(supplied).digest();
  const expected = createHash('sha256').update(secret).digest();
  return timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  const production = isProductionDeployment();
  let expectedSource: string | null = null;
  if (production) {
    if (
      process.env.TELEMETRY_HISTORY_ENABLED !== 'true' ||
      !process.env.TELEMETRY_STORE_TOKEN ||
      process.env.TELEMETRY_STORE_TOKEN.length < 32
    )
      return Response.json({ error: 'SNMP_PRODUCTION_STORE_NOT_SECURE' }, { status: 503 });
    try {
      expectedSource = authorizeController(
        request.headers.get('authorization'),
        process.env.SNMP_INGEST_SOURCES_JSON,
      );
    } catch {
      return Response.json({ error: 'SNMP_SOURCE_CREDENTIALS_INVALID' }, { status: 503 });
    }
    if (!expectedSource) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  } else {
    const secret = process.env.SNMP_INGEST_TOKEN;
    if (!secret || secret.length < 32)
      return Response.json({ error: 'SNMP_INGEST_DISABLED' }, { status: 503 });
    if (!authorizedSnmpCollector(request.headers.get('authorization'), secret))
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const parsed = await readBoundedJson(request, { maxBytes: 16_384, maxDepth: 4, maxNodes: 340 });
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  }
  const packet = parseSnmpFeedPacket(parsed.value);
  if (!packet.ok) return Response.json({ error: packet.error }, { status: 400 });
  if (production && packet.value.sourceIdentity !== expectedSource)
    return Response.json({ error: 'COLLECTOR_SOURCE_MISMATCH' }, { status: 403 });

  const runtime = await getTelemetryRuntime();
  const history =
    process.env.TELEMETRY_HISTORY_ENABLED === 'true' ? createTelemetryStoreClient() : undefined;
  const service = new SnmpFeedService(
    await createTopologyRepository(),
    await createTelemetryBindingRepository(),
    runtime.hub,
    history,
  );
  const result = await service.ingest(packet.value);
  if (!result.ok)
    return Response.json(
      { error: result.error },
      { status: result.error === 'HISTORY_STORE_UNAVAILABLE' ? 503 : 422 },
    );
  return Response.json(
    {
      acceptedFeeds: result.value.map((sample) => sample.targetId),
      observedAt: packet.value.observedAt,
      historyCommitted: Boolean(history),
      historyDisposition: history?.snmpCommitDisposition() ?? 'not_required',
    },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  );
}
