import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { ALARM_DEFINITIONS } from '@/modules/alarm/domain/catalog';
import {
  DEFAULT_DC_PROFILE, MANAGED_RULE_CODES, parseRuleDraft,
  type RuleDraftInput,
} from '@/modules/alarm/domain/rule-manager';
import { createRuleManagerStore } from '@/modules/alarm/infrastructure/rule-manager-store';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  readBoundedJson, jsonBodyErrorStatus, isSafeMutationRequest,
} from '@/shared/http/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) return NextResponse.json({error:auth.error},{status:401});
  const store = await createRuleManagerStore();
  return NextResponse.json({
    catalog:ALARM_DEFINITIONS,
    managedCodes:MANAGED_RULE_CODES,
    profile:DEFAULT_DC_PROFILE,
    records:await store.list(),
  },{headers:{'Cache-Control':'no-store'}});
}

async function assertScope(input: RuleDraftInput) {
  if (input.scope === 'GLOBAL') return;
  const topology = await createTopologyRepository();
  const node = await topology.getById(input.scopeId!);
  if (!node || node.lifecycle !== 'ACTIVE') throw new Error('RULE_SCOPE_NOT_ACTIVE');
  if (input.scope === 'QDF' && node.kind !== 'DEVICE')
    throw new Error('RULE_SCOPE_NOT_QDF_DEVICE');
  if (input.scope === 'PANEL' && (node.kind !== 'EQUIPMENT' || node.equipmentType !== 'PANEL'))
    throw new Error('RULE_SCOPE_NOT_PANEL');
  if (input.scope === 'BREAKER' && (node.kind !== 'EQUIPMENT' || node.equipmentType !== 'CIRCUIT_BREAKER'))
    throw new Error('RULE_SCOPE_NOT_BREAKER');
}

export async function POST(request: Request) {
  const auth = await requirePermission('settings:write');
  if (!auth.ok) return NextResponse.json({error:auth.error},{status:403});
  if (!isSafeMutationRequest(request))
    return NextResponse.json({error:'INVALID_ORIGIN'},{status:403});
  const parsed = await readBoundedJson(request);
  if (!parsed.ok) return NextResponse.json({error:parsed.error},{status:jsonBodyErrorStatus(parsed.error)});
  const body = parsed.value;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json({error:'INVALID_REQUEST'},{status:400});
  const input = body as Record<string,unknown>;
  const store = await createRuleManagerStore();
  try {
    if (input.action === 'SAVE_DRAFT') {
      const draft = parseRuleDraft(input.rule);
      await assertScope(draft);
      const record = await store.saveDraft(draft,auth.value.id);
      return NextResponse.json({record},{status:200});
    }
    if (input.action === 'PUBLISH' || input.action === 'DISABLE') {
      if (typeof input.id !== 'string' || input.id.length > 128 ||
          !Number.isSafeInteger(input.expectedRevision) ||
          Number(input.expectedRevision) < 1)
        throw new Error('INVALID_RULE_REVISION');
      if (input.action === 'PUBLISH' && input.confirmImpact !== true)
        throw new Error('RULE_IMPACT_CONFIRMATION_REQUIRED');
      const existing = await store.get(input.id);
      if (!existing) throw new Error('RULE_NOT_FOUND');
      if (input.action === 'PUBLISH') {
        // Re-validate stored draft and active topology at publication time.
        const d = existing.draft;
        const checked = parseRuleDraft({
          id:d.id,expectedRevision:existing.revision,code:d.code,
          scope:d.scope,scopeId:d.scopeId,electricalProfileId:d.electricalProfileId,
          parameters:d.parameters,severity:d.severity,
          debounceSamples:d.debounceSamples,recoverySamples:d.recoverySamples,
        });
        await assertScope(checked);
      }
      const record = await store.changeStatus(
        input.id,Number(input.expectedRevision),
        input.action === 'PUBLISH' ? 'PUBLISH':'DISABLE',auth.value.id);
      return NextResponse.json({record});
    }
    throw new Error('UNKNOWN_RULE_ACTION');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INVALID_RULE_REQUEST';
    const status = message === 'RULE_NOT_FOUND' ? 404
      : message === 'RULE_STALE_WRITE' || message === 'RULE_ID_SCOPE_MISMATCH' ? 409
      : 400;
    return NextResponse.json({error:message},{status});
  }
}
