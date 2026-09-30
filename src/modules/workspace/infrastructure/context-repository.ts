import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { emptyContext, type WorkspaceContext } from '@/modules/workspace/domain/context';

export async function readContext(userId: string): Promise<WorkspaceContext> {
  if (getPersistenceMode() === 'memory')
    return structuredClone(memory().get(userId) ?? emptyContext());
  const doc = await (
    await getMongoDatabase()
  )
    .collection<WorkspaceContext & { _id: string }>('workspace_context')
    .findOne({ _id: userId });
  return doc
    ? { lastContext: doc.lastContext, recent: doc.recent, pinned: doc.pinned }
    : emptyContext();
}
export async function writeContext(userId: string, context: WorkspaceContext): Promise<void> {
  if (getPersistenceMode() === 'memory') {
    memory().set(userId, structuredClone(context));
    return;
  }
  await (
    await getMongoDatabase()
  )
    .collection<WorkspaceContext & { _id: string }>('workspace_context')
    .replaceOne({ _id: userId }, context, { upsert: true });
}
function memory() {
  return getProcessSingleton('workspace-context', () => new Map<string, WorkspaceContext>());
}
