import { IntegrityConflict } from '@/shared/infrastructure/mongodb/integrity-transaction';
import { integrityErrorResponse } from '@/shared/http/integrity-error';
import { readBoundedJson, jsonBodyErrorStatus, isSafeMutationRequest } from '@/shared/http/request-security';
import { withAdminAudit } from '@/modules/settings/infrastructure/admin-audit';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  prepareLayoutSave,
  readLayoutDraft,
} from '@/modules/spatial/application/layout-editor-service';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { id } = await context.params;
  const value = await readLayoutDraft(await createTopologyRepository(), id);
  return value
    ? NextResponse.json({ draft: value.draft })
    : NextResponse.json({ error: 'ROOM_NOT_FOUND' }, { status: 404 });
}
export async function PUT(request: Request, context: Context) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (!isSafeMutationRequest(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsed = await readBoundedJson(request, { maxBytes: 1_000_000, maxNodes: 50_000, maxDepth: 16 });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  const body = parsed.value;
  const { id } = await context.params;
  const repo = await createTopologyRepository();
  const result = await prepareLayoutSave(repo, id, body);
  if ('error' in result)
    return NextResponse.json(result, { status: result.error === 'LAYOUT_CONFLICT' ? 409 : 422 });
  if (!repo.commitLayout)
    return NextResponse.json({ error: 'ATOMIC_LAYOUT_STORAGE_REQUIRED' }, { status: 503 });
  try {
    await withAdminAudit(auth.value.id, 'ROOM_LAYOUT_SAVE', id, async () => {
      if (!(await repo.commitLayout!(result.before, result.after))) throw new IntegrityConflict('LAYOUT_CONFLICT');
    });
    return NextResponse.json({ draft: (await readLayoutDraft(repo, id))!.draft });
  } catch (error) {
    if (error instanceof IntegrityConflict) return integrityErrorResponse(error);
    return NextResponse.json({ error: 'LAYOUT_SAVE_FAILED_TRANSACTION_REQUIRED' }, { status: 503 });
  }
}
