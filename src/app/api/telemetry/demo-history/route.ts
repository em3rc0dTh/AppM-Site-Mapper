import { NextResponse } from 'next/server';
import type { Document } from 'mongodb';

import { requirePermission } from '@/modules/identity/application/current-session';
import {
  DEMO_TELEMETRY_HISTORY_RANGE_MS,
  parseDemoTelemetryHistoryRange,
  type DemoTelemetryHistoryPoint,
} from '@/modules/telemetry/application/demo-telemetry-history';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DemoHistoryDocument extends Document {
  entityId: string;
  componentAddress: string;
  observedAt: Date;
  state: string;
  values: Record<string, string>;
}

const COMPONENT_ADDRESS = /^\d+_\d+_\d+$/;

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  if (process.env.TELEMETRY_DEMO_HISTORY !== 'true') {
    return NextResponse.json({ error: 'DEMO_HISTORY_DISABLED' }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const entityId = params.get('entityId')?.trim();
  const componentAddress = params.get('componentAddress')?.trim();
  const range = parseDemoTelemetryHistoryRange(params.get('range'));

  if (
    !entityId ||
    entityId.length > 128 ||
    !componentAddress ||
    !COMPONENT_ADDRESS.test(componentAddress) ||
    !range
  ) {
    return NextResponse.json({ error: 'INVALID_HISTORY_QUERY' }, { status: 400 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - DEMO_TELEMETRY_HISTORY_RANGE_MS[range]);
  const database = await getMongoDatabase();
  const collection = database.collection<DemoHistoryDocument>('telemetry_demo_history');
  const documents = await collection
    .find({
      entityId,
      componentAddress,
      observedAt: { $gte: since, $lte: now },
    })
    .sort({ observedAt: 1 })
    .limit(1000)
    .toArray();

  const points: DemoTelemetryHistoryPoint[] = documents.map((document) => ({
    observedAt: document.observedAt.toISOString(),
    state: document.state,
    values: document.values,
  }));

  return NextResponse.json({
    entityId,
    componentAddress,
    range,
    synthetic: true,
    points,
  });
}
