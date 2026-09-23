import Link from 'next/link';
import { StatusBadge } from '@/shared/ui/primitives';

export function WorkspaceMode({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="workspace-mode" aria-label="Workspace mode">
      <StatusBadge>READ VIEW</StatusBadge>
      <span>
        {canEdit
          ? 'Open an entity to use its permitted editing controls.'
          : 'Your role has read-only access.'}
      </span>
      {canEdit && <Link href="/network">Manage topology →</Link>}
    </div>
  );
}
