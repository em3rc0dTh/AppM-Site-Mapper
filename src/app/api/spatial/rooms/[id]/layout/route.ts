import { recordAdminAudit } from '@/modules/settings/infrastructure/admin-audit';
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
  const text = await request.text();
  if (text.length > 1000000)
    return NextResponse.json({ error: 'LAYOUT_TOO_LARGE' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const { id } = await context.params;
  const repo = await createTopologyRepository();
  const result = await prepareLayoutSave(repo, id, body);
  if ('error' in result)
    return NextResponse.json(result, { status: result.error === 'LAYOUT_CONFLICT' ? 409 : 422 });
  if (!repo.commitLayout)
    return NextResponse.json({ error: 'ATOMIC_LAYOUT_STORAGE_REQUIRED' }, { status: 503 });
  try {
    const saved = await repo.commitLayout(result.before, result.after);
    if (!saved) return NextResponse.json({ error: 'LAYOUT_CONFLICT' }, { status: 409 });
    await recordAdminAudit(auth.value.id, 'ROOM_LAYOUT_SAVE', id);
    return NextResponse.json({ draft: (await readLayoutDraft(repo, id))!.draft });
  } catch {
    return NextResponse.json({ error: 'LAYOUT_SAVE_FAILED_TRANSACTION_REQUIRED' }, { status: 503 });
  }
}
