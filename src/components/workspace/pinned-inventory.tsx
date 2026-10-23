import { StatePanel } from '@/shared/ui/primitives';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import type { WorkspacePinnedItem } from '@/modules/workspace/application/workspace-service';

export function PinnedInventory({ items }: Readonly<{ items: readonly WorkspacePinnedItem[] }>) {
  const t = useTranslations('workspaceUi');
  return (
    <section className="workspace-side-section">
      <div className="workspace-section-title">
        <span>{t('pinned')}</span>
      </div>
      {items.length === 0 ? (
        <StatePanel
          title={t('pinnedTitle')}
          description={t('pinnedHelp')}
        />
      ) : (
        <ul className="workspace-compact-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href}>
                <strong>{item.name}</strong>
                <span>{item.kind === 'DEVICE' ? 'Device' : 'Equipment'}</span>
                {item.serialNumber ? <small>{item.serialNumber}</small> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
