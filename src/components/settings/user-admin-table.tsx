'use client';

import { useTranslations } from 'next-intl';
import { DataView, StatusBadge } from '@/shared/ui/primitives';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { SafeUser } from '@/modules/identity/domain/entities';
import type { Role } from '@/modules/identity/domain/roles';

export function UserAdminTable({
  currentUserId,
  users,
}: Readonly<{ currentUserId: string; users: readonly SafeUser[] }>) {
  const t = useTranslations('forms.users');
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, string>) {
    setPendingId(id);
    setError(null);

    const response = await fetch(`/api/settings/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(t('failed'));
      setPendingId(null);
      return;
    }

    setPendingId(null);
    router.refresh();
  }

  return (
    <DataView mode="table" label={t('administration')}>
      <table className="settings-user-table">
        <thead>
          <tr>
            <th>{t('name')}</th>
            <th>{t('role')}</th>
            <th>{t('status')}</th>
            <th>{t('password')}</th>
            <th>{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            return (
              <tr key={user.id}>
                <td>
                  <strong>{user.displayName}</strong>
                  <small>{user.email}</small>
                </td>
                <td>
                  <select
                    aria-label={t('roleFor', { name: user.displayName })}
                    defaultValue={user.role}
                    disabled={isSelf || pendingId === user.id}
                    onChange={(event) => patch(user.id, { role: event.target.value as Role })}
                  >
                    <option value="STANDARD">{t('standard')}</option>
                    <option value="ADMIN">{t('admin')}</option>
                    <option value="SUPERADMIN">{t('superadmin')}</option>
                  </select>
                </td>
                <td>
                  <StatusBadge tone={user.lifecycle === 'ACTIVE' ? 'good' : 'neutral'}>
                    {user.lifecycle === 'ACTIVE' ? t('active') : t('archived')}
                  </StatusBadge>
                </td>
                <td>{user.mustChangePassword ? t('changeRequired') : t('configured')}</td>
                <td>
                  <button
                    disabled={isSelf || pendingId === user.id}
                    onClick={() =>
                      patch(user.id, {
                        lifecycle: user.lifecycle === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
                      })
                    }
                    type="button"
                  >
                    •••
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? <p className="form-error">{error}</p> : null}
    </DataView>
  );
}
