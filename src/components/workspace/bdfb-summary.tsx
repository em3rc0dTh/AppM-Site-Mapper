import { StatePanel } from '@/shared/ui/primitives';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { WorkspaceBdfbSummary } from '@/modules/workspace/application/workspace-service';

export function BdfbSummary({ items }: Readonly<{ items: readonly WorkspaceBdfbSummary[] }>) {
  const t = useTranslations('summary');
  return (
    <section className="panel">
      <div className="workspace-section-title">
        <span>{t('title')}</span>
        <Link href="/power">{t('paths')}</Link>
      </div>
      {items.length === 0 ? (
        <StatePanel title={t('empty')} description={t('emptyHelp')} />
      ) : (
        <div className="workspace-card-grid">
          {items.map((item) => (
            <Link className="workspace-summary-card" href={item.href} key={item.deviceId}>
              <strong>{item.deviceName}</strong>
              <span>{t('shelves', { count: item.shelves })}</span>
              <span>{t('frames', { count: item.frames })}</span>
              <span>{t('panels', { count: item.panels })}</span>
              <span>{t('endpoints', { count: item.endpoints })}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
