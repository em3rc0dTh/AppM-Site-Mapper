import { NextResponse } from 'next/server';

import { seedDevelopmentDemo } from '@/dev/demo-seed';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import {
  createTopologyRepository,
  getPersistenceMode,
} from '@/modules/topology/infrastructure/topology-repository-factory';

export async function POST() {
  if (process.env.APP_ENV !== 'development' || getPersistenceMode() !== 'memory') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const auth = await requirePermission('system:danger');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const result = await seedDevelopmentDemo(
    await createTopologyRepository(),
    await createPowerRepository(),
  );

  return NextResponse.json({ demo: result }, { status: result.alreadyPresent ? 200 : 201 });
}
