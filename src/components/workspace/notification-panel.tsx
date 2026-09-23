import type { WorkspaceNotification } from '@/modules/workspace/application/workspace-service';

export function NotificationPanel({
  notifications,
}: Readonly<{ notifications: readonly WorkspaceNotification[] }>) {
  return (
    <section className="workspace-side-section">
      <div className="workspace-section-title">
        <span>Notifications</span>
        <strong>{notifications.length}</strong>
      </div>
      {notifications.length === 0 ? (
        <p>No configuration warnings.</p>
      ) : (
        <ul className="workspace-notifications">
          {notifications.map((notification) => (
            <li key={notification.id} data-severity={notification.severity}>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
