import Link from 'next/link';
import { StatePanel } from '@/shared/ui/primitives';
import type { WorkspaceNotification } from '@/modules/workspace/application/workspace-service';

export function NotificationPanel({
  notifications,
}: Readonly<{ notifications: readonly WorkspaceNotification[] }>) {
  return (
    <section className="workspace-side-section">
      <div className="workspace-section-title">
        <span>ATTENTION</span>
        <strong>{notifications.length}</strong>
      </div>
      {notifications.length === 0 ? (
        <StatePanel
          title="No configuration warnings"
          description="Inventory configuration checks have no warnings to display."
        />
      ) : (
        <ul className="workspace-notifications">
          {notifications.map((notification) => (
            <li key={notification.id} data-severity={notification.severity}>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
              {notification.entityId && (
                <>
                  <Link href={`/device/${notification.entityId}`}>LOCATE →</Link>{' '}
                  <Link href={`/power?entity=${notification.entityId}`}>TRACE POWER →</Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
