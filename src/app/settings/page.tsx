import Link from 'next/link';
import { LanguageSwitcher } from '@/shared/ui/language-switcher';
import type { Permission, Role } from '@/modules/identity/domain/roles';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PasswordForm } from '@/components/settings/password-form';
import { ProfileForm } from '@/components/settings/profile-form';
import { UserAdminTable } from '@/components/settings/user-admin-table';
import { UserCreateForm } from '@/components/settings/user-create-form';
import { AuthService } from '@/modules/identity/application/auth-service';
import { getCurrentSessionUser } from '@/modules/identity/application/current-session';
import {
  resolveSettingsTab,
  settingsTabSlug,
  visibleSettingsTabs,
} from '@/modules/settings/domain/settings-access';
import { hasPermission } from '@/modules/identity/domain/roles';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const query = await searchParams;
  const t = await getTranslations('pages.settings');
  // Valid sessions may access personal settings even without admin permissions.
  const user = await getCurrentSessionUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/change-password');

  const canManageUsers = hasPermission(user.role, 'users:manage');
  const runtime = await getIdentityRuntime();
  const usersResult = canManageUsers
    ? await new AuthService(runtime.repository, runtime.throttle).listUsers(user)
    : null;
  const users = usersResult?.ok ? usersResult.value : [];

  const visible = visibleSettingsTabs(user.role);
  const active = resolveSettingsTab(user.role, query.tab);
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
    Profile: t('tabs.profile'),
    Security: t('tabs.security'),
    Users: t('tabs.users'),
    Roles: t('tabs.roles'),
  };

  return (
    <main className="settings-shell">
      <div className="zip-settings-page-title" aria-hidden="true">
        {t('title')}
      </div>
      <div className="mk-settings-layout">
        <nav className="mk-settings-nav" aria-label={t('areas')}>
          <span className="mk-settings-nav-title">{t('title')}</span>
          {visible.map((tab) => (
            <Link
              key={tab}
              href={`/settings?tab=${settingsTabSlug(tab)}`}
              aria-current={active === tab ? 'page' : undefined}
            >
              <span className="zip-settings-icon" aria-hidden="true">
                {tab === 'Profile'
                  ? '♙'
                  : tab === 'Security' || tab === 'Roles'
                    ? '◇'
                    : '♧'}
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
                {user.email} · {user.role}
              </p>
              <ProfileForm displayName={user.displayName} />
              <LanguageSwitcher />
            </>
          )}

          {active === 'Security' && (
            <>
              <h2>{t('tabs.security')}</h2>
              <p>{t('passwordPolicy')}</p>
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
              <UserAdminTable currentUserId={user.id} users={users} />
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
        </section>
      </div>
    </main>
  );
}
