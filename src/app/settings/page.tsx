import Link from 'next/link';
import { LayoutImport } from '@/components/settings/layout-import';
import type { Permission, Role } from '@/modules/identity/domain/roles';
import { SectionHeader, StatusBadge } from '@/shared/ui/primitives';
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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const query = await searchParams;
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

  const tabs = [
    'Profile',
    'Security',
    'Users',
    'Roles',
    'Data Import',
    'Drafting',
    'System',
    'Danger Zone',
  ];
  const visible = tabs.filter((tab) => tab !== 'Users' || canManageUsers);
  const active =
    visible.find((tab) => tab.toLowerCase().replaceAll(' ', '-') === query.tab) ??
    (canManageUsers ? 'Users' : 'Profile');
  const permissions: Permission[] = [
    'topology:read',
    'topology:write',
    'power:read',
    'power:write',
    'telemetry:read',
    'settings:read',
    'settings:write',
    'users:manage',
    'system:danger',
  ];
  const roles: Role[] = ['STANDARD', 'ADMIN', 'SUPERADMIN'];
  return (
    <main className="settings-shell">
      <div className="zip-settings-page-title" aria-hidden="true">SETTINGS</div>
      <div className="mk-settings-layout">
        <nav className="mk-settings-nav" aria-label="Settings areas">
          {visible.map((tab) => (
            <Link
              key={tab}
              href={`/settings?tab=${tab.toLowerCase().replaceAll(' ', '-')}`}
              aria-current={active === tab ? 'page' : undefined}
            >
              <span className="zip-settings-icon" aria-hidden="true">{tab === 'Profile' ? '♙' : tab === 'Security' || tab === 'Roles' ? '◇' : tab === 'Users' ? '♧' : tab === 'Data Import' ? '⇥' : tab === 'Drafting' ? '◩' : tab === 'System' ? '⚙' : '△'}</span>
              <span>{tab}</span>
            </Link>
          ))}
        </nav>
        <section className="mk-settings-body">
          {active === 'Profile' && (
            <>
              <h2>Profile</h2>
              <p>
                {auth.value.email} · {auth.value.role}
              </p>
              {canWrite && <ProfileForm displayName={auth.value.displayName} />}
            </>
          )}
          {active === 'Security' && (
            <>
              <h2>Security</h2>
              <p>
                Passwords require at least 12 characters. Password changes revoke existing sessions.
              </p>
              <PasswordForm />
            </>
          )}
          {active === 'Users' && canManageUsers && (
            <>
              <div className="zip-users-heading"><h2>USERS</h2><details><summary>＋ ADD USER</summary><UserCreateForm /></details></div>
              <UserAdminTable currentUserId={auth.value.id} users={users} />
            </>
          )}
          {active === 'Roles' && (
            <>
              <h2>Roles</h2>
              <table className="mk-role-table">
                <thead>
                  <tr>
                    <th>Permission</th>
                    {roles.map((role) => (
                      <th key={role}>{role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((permission) => (
                    <tr key={permission}>
                      <td>{permission}</td>
                      {roles.map((role) => (
                        <td key={role}>{hasPermission(role, permission) ? 'Allowed' : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>Permissions are enforced on the server.</p>
            </>
          )}
          {active === 'Data Import' &&
            (hasPermission(auth.value.role, 'topology:write') ? (
              <LayoutImport />
            ) : (
              <p>Import requires topology write permission.</p>
            ))}
          {active === 'Drafting' && (
            <>
              <h2>Drafting</h2>
              <p>
                Physical grid: 600 × 600 mm. Position coordinates snap to this grid. Rack dimensions
                remain physical millimeters. Collisions and out-of-bound placement block Save.
              </p>
              <p>Open a Room to edit its surveyed polygon, clusters and positions.</p>
              <Link className="mk-primary" href="/network">
                OPEN NETWORK
              </Link>
            </>
          )}
          {active === 'System' && (
            <>
              <h2>System</h2>
              <dl>
                <dt>Environment</dt>
                <dd>{appEnvironment}</dd>
                <dt>Persistence</dt>
                <dd>{getPersistenceMode()}</dd>
                <dt>Telemetry</dt>
                <dd>
                  {process.env.TELEMETRY_ENABLED === 'true'
                    ? 'Configured — inspect contextual telemetry for current freshness'
                    : 'Not configured'}
                </dd>
              </dl>
            </>
          )}
          {active === 'Danger Zone' && (
            <>
              <h2>Danger Zone</h2>
              <p>
                Database reset is unavailable. Use controlled administration outside the operational
                UI.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
