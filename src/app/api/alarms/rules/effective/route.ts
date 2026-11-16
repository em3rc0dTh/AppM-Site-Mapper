import { NextResponse } from 'next/server';

import { EffectiveAlarmPolicyRepository } from '@/modules/alarm/application/effective-alarm-policy-repository';
import { createLegacyAlarmPolicyRepository } from '@/modules/alarm/infrastructure/alarm-policy-repository-factory';
import { createRuleManagerStore } from '@/modules/alarm/infrastructure/rule-manager-store';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) return NextResponse.json({error:auth.error},{status:401});
  const targetId = new URL(request.url).searchParams.get('breakerId');
  if (!targetId || targetId.length > 128)
    return NextResponse.json({error:'INVALID_BREAKER_ID'},{status:400});
  const repo = new EffectiveAlarmPolicyRepository(
    await createLegacyAlarmPolicyRepository(), await createRuleManagerStore(),
    await createTopologyRepository(), await createTelemetryBindingRepository(),
  );
  const rules = await repo.effectiveRuleSnapshot(targetId);
  const policies = await repo.listEnabledForTarget('EQUIPMENT',targetId);
  return NextResponse.json({breakerId:targetId,rules,policies},{
    headers:{'Cache-Control':'no-store'},
  });
}
