import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PasswordForm } from '@/components/settings/password-form';
import { ProfileForm } from '@/components/settings/profile-form';
import { UserAdminTable } from '@/components/settings/user-admin-table';
import { UserCreateForm } from '@/components/settings/user-create-form';
import { parseAppEnvironment } from '@/config/env';
import { AuthService } from '@/modules/identity/application/auth-service';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const auth = await requirePermission('settings:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const canWrite = hasPermission(auth.value.role, 'settings:write');
  const canManageUsers = hasPermission(auth.value.role, 'users:manage');
  const runtime = await getIdentityRuntime();
  const usersResult = canManageUsers
    ? await new AuthService(runtime.repository, runtime.throttle).listUsers(auth.value)
    : null;
  const users = usersResult?.ok ? usersResult.value : [];
  const appEnvironment = parseAppEnvironment(process.env.APP_ENV);

  return (
    <main className="settings-shell">
      <header className="settings-header">
        <div>
          <p className="eyebrow">AppManager · Site Mapper</p>
          <h1>Settings</h1>
          <p>
            Account, security and administrative controls with server-authoritative permissions.
          </p>
        </div>
        <Link className="action-link" href="/workspace">
          Back to workspace
        </Link>
      </header>

      <div className="settings-grid">
        <section className="panel">
          <h2>Profile</h2>
          <dl className="settings-facts">
            <div>
              <dt>Email</dt>
              <dd>{auth.value.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{auth.value.role}</dd>
            </div>
          </dl>
          {canWrite ? <ProfileForm displayName={auth.value.displayName} /> : null}
        </section>

        <section className="panel">
          <h2>Security</h2>
          <p>Passwords require at least 12 characters. A successful change revokes all sessions.</p>
          <PasswordForm />
        </section>

        <section className="panel">
          <h2>System</h2>
          <dl className="settings-facts">
            <div>
              <dt>Environment</dt>
              <dd>{appEnvironment}</dd>
            </div>
            <div>
              <dt>Persistence</dt>
              <dd>{getPersistenceMode()}</dd>
            </div>
          </dl>
          <p>No credential or secret value is exposed through this screen.</p>
        </section>

        <section className="panel settings-danger">
          <h2>Danger Zone</h2>
          <p>
            Destructive database reset is intentionally not exposed as a production runtime action.
            Migration and test cleanup live in controlled tooling instead.
          </p>
        </section>
      </div>

      {canManageUsers ? (
        <section className="panel settings-users">
          <div className="settings-section-heading">
            <div>
              <h2>Users</h2>
              <p>New users must replace their temporary password before authorized operations.</p>
            </div>
          </div>
          <UserCreateForm />
          <UserAdminTable currentUserId={auth.value.id} users={users} />
        </section>
      ) : null}
    </main>
  );
}
