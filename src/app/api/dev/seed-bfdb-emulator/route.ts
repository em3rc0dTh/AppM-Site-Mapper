import { NextResponse } from 'next/server';

import { seedBfdbEmulatorLab } from '@/dev/bfdb-emulator-seed';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import {
  createTopologyRepository,
  getPersistenceMode,
} from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';

export async function POST() {
  if (process.env.APP_ENV !== 'development' || getPersistenceMode() !== 'memory') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const auth = await requirePermission('system:danger');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const devices = await seedBfdbEmulatorLab(
    await createTopologyRepository(),
    await createPowerRepository(),
  );
  return NextResponse.json({
    profile: 'bfdb-emulator-panelized-24',
    synthetic: true,
    devices,
  });
}
