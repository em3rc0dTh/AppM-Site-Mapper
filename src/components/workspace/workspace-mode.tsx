import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/shared/ui/primitives';

export function WorkspaceMode({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('workspaceUi');
  return (
    <div className="workspace-mode" aria-label={t('mode')}>
      <StatusBadge>{t('readView')}</StatusBadge>
      <span>{canEdit ? t('editHelp') : t('readonly')}</span>
      {canEdit && <Link href="/network">{t('manageTopology')}</Link>}
    </div>
  );
}
