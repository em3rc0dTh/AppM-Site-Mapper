import { NextResponse } from 'next/server';
import { requirePermission } from '@/modules/identity/application/current-session';
import { BreakerLimitService } from '@/modules/power/application/breaker-limit-service';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';

export async function GET(_request: Request, context: {params: Promise<{id:string}>}) {
  const auth = await requirePermission('power:read');
  if (!auth.ok) return NextResponse.json({error:auth.error}, {status:403});
  if (getPersistenceMode() !== 'mongodb') {
    return NextResponse.json({error:'BREAKER_LIMITS_REQUIRE_PERSISTENT_STORAGE'}, {status:503});
  }
  try {
    const {id} = await context.params;
    const history = await new BreakerLimitService(await getMongoDatabase()).history(id);
    return NextResponse.json({history}, {headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const code = error instanceof Error ? error.message : 'BREAKER_LIMIT_HISTORY_FAILED';
    return NextResponse.json({error:code},{status:code==='BREAKER_NOT_FOUND'?404:409});
  }
}
