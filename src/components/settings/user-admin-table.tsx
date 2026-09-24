'use client';

import { DataView, StatusBadge } from '@/shared/ui/primitives';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { SafeUser } from '@/modules/identity/domain/entities';
import type { Role } from '@/modules/identity/domain/roles';

function userAdminErrorMessage(error: string): string {
  const messages: Readonly<Record<string, string>> = {
    FORBIDDEN: 'Your role cannot make this user-management change.',
    SELF_MANAGEMENT_RESTRICTED: 'You cannot change your own role or archive your own account here.',
    LAST_SUPERADMIN: 'The last active Superadmin cannot be archived or downgraded.',
    INVALID_INPUT: 'The requested user change is invalid.',
    USER_NOT_FOUND: 'This user no longer exists.',
    USER_UPDATE_FAILED: 'User could not be updated. Try again.',
  };

  return messages[error] ?? error.replaceAll('_', ' ');
}

export function UserAdminTable({
  currentUserId,
  users,
}: Readonly<{ currentUserId: string; users: readonly SafeUser[] }>) {
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
      setError(userAdminErrorMessage(result?.error ?? 'USER_UPDATE_FAILED'));
      setPendingId(null);
      return;
    }

    setPendingId(null);
    router.refresh();
  }

  return (
    <DataView mode="table" label="User administration">
      <p className="settings-user-help">
        Standard can read topology, power and telemetry. Admin can also edit topology, power and
        settings. Superadmin can additionally manage users and protected system actions. Archive
        disables the user while preserving the account record.
      </p>
      <table className="settings-user-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th>Password</th>
            <th>Actions</th>
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
                    aria-label={`Role for ${user.displayName}`}
                    defaultValue={user.role}
                    disabled={isSelf || pendingId === user.id}
                    onChange={(event) => patch(user.id, { role: event.target.value as Role })}
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPERADMIN">Superadmin</option>
                  </select>
                </td>
                <td>
                  <StatusBadge tone={user.lifecycle === 'ACTIVE' ? 'good' : 'neutral'}>
                    {user.lifecycle}
                  </StatusBadge>
                </td>
                <td>{user.mustChangePassword ? 'Change required' : 'Configured'}</td>
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
                    {user.lifecycle === 'ACTIVE' ? 'Archive' : 'Restore'}
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
