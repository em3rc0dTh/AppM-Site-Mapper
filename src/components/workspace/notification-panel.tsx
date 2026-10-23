import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StatePanel } from '@/shared/ui/primitives';
import type { WorkspaceNotification } from '@/modules/workspace/application/workspace-service';

export function NotificationPanel({
  notifications,
}: Readonly<{ notifications: readonly WorkspaceNotification[] }>) {
  const t = useTranslations('workspaceUi');
  return (
    <section className="workspace-side-section">
      <div className="workspace-section-title">
        <span>{t('attention')}</span>
        <strong>{notifications.length}</strong>
      </div>
      {notifications.length === 0 ? (
        <StatePanel title={t('noWarnings')} description={t('noWarningsDescription')} />
      ) : (
        <ul className="workspace-notifications">
          {notifications.map((notification) => (
            <li key={notification.id} data-severity={notification.severity}>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
              {notification.entityId && (
                <>
                  <Link href={`/device/${notification.entityId}`}>{t('locate')}</Link>{' '}
                  <Link href={`/power?entity=${notification.entityId}`}>{t('tracePower')}</Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
