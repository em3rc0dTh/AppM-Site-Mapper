import Link from 'next/link';
import { LayoutImport } from '@/components/settings/layout-import';
import type { Permission, Role } from '@/modules/identity/domain/roles';
import { SectionHeader, StatusBadge } from '@/shared/ui/primitives';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

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
  const t = await getTranslations('pages.settings');
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
  const tabLabels: Record<string, string> = {
    'Profile': t('tabs.profile'),
    'Security': t('tabs.security'),
    'Users': t('tabs.users'),
    'Roles': t('tabs.roles'),
    'Data Import': t('tabs.dataImport'),
    'Drafting': t('tabs.drafting'),
    'System': t('tabs.system'),
    'Danger Zone': t('tabs.danger'),
  };
  return (
    <main className="settings-shell">
      <div className="zip-settings-page-title" aria-hidden="true">
        {t('title')}
      </div>
      <div className="mk-settings-layout">
        <nav className="mk-settings-nav" aria-label={t('areas')}>
          {visible.map((tab) => (
            <Link
              key={tab}
              href={`/settings?tab=${tab.toLowerCase().replaceAll(' ', '-')}`}
              aria-current={active === tab ? 'page' : undefined}
            >
              <span className="zip-settings-icon" aria-hidden="true">
                {tab === 'Profile'
                  ? '♙'
                  : tab === 'Security' || tab === 'Roles'
                    ? '◇'
                    : tab === 'Users'
                      ? '♧'
                      : tab === 'Data Import'
                        ? '⇥'
                        : tab === 'Drafting'
                          ? '◩'
                          : tab === 'System'
                            ? '⚙'
                            : '△'}
              </span>
              <span>{tabLabels[tab]}</span>
            </Link>
          ))}
        </nav>
        <section className="mk-settings-body">
          {active === 'Profile' && (
            <>
              <h2>{t('tabs.profile')}</h2>
              <p>
                {auth.value.email} · {auth.value.role}
              </p>
              {canWrite && <ProfileForm displayName={auth.value.displayName} />}
            </>
          )}
          {active === 'Security' && (
            <>
              <h2>{t('tabs.security')}</h2>
              <p>
                {t('passwordPolicy')}
              </p>
              <PasswordForm />
            </>
          )}
          {active === 'Users' && canManageUsers && (
            <>
              <div className="zip-users-heading">
                <h2>{t('tabs.users')}</h2>
                <details>
                  <summary>{t('addUser')}</summary>
                  <UserCreateForm />
                </details>
              </div>
              <UserAdminTable currentUserId={auth.value.id} users={users} />
            </>
          )}
          {active === 'Roles' && (
            <>
              <h2>{t('tabs.roles')}</h2>
              <table className="mk-role-table">
                <thead>
                  <tr>
                    <th>{t('permission')}</th>
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
                        <td key={role}>{hasPermission(role, permission) ? t('allowed') : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>{t('serverEnforcement')}</p>
            </>
          )}
          {active === 'Data Import' &&
            (hasPermission(auth.value.role, 'topology:write') ? (
              <LayoutImport />
            ) : (
              <p>{t('importDenied')}</p>
            ))}
          {active === 'Drafting' && (
            <>
              <h2>{t('tabs.drafting')}</h2>
              <p>
                {t('gridPolicy')}
              </p>
              <p>{t('drawingHelp')}</p>
              <Link className="mk-primary" href="/network">
                {t('openNetwork')}
              </Link>
            </>
          )}
          {active === 'System' && (
            <>
              <h2>{t('tabs.system')}</h2>
              <dl>
                <dt>{t('environment')}</dt>
                <dd>{appEnvironment}</dd>
                <dt>{t('persistence')}</dt>
                <dd>{getPersistenceMode()}</dd>
                <dt>{t('telemetry')}</dt>
                <dd>
                  {process.env.TELEMETRY_ENABLED === 'true'
                    ? t('configured')
                    : t('notConfigured')}
                </dd>
              </dl>
            </>
          )}
          {active === 'Danger Zone' && (
            <>
              <h2>{t('tabs.danger')}</h2>
              <p>
                {t('dangerHelp')}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
