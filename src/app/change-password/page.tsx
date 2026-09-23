import { redirect } from 'next/navigation';

import { PasswordForm } from '@/components/settings/password-form';
import { getCurrentSessionUser } from '@/modules/identity/application/current-session';
import { AuthFrame } from '@/shared/ui/auth-frame';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await getCurrentSessionUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <AuthFrame
      eyebrow="Identity / credential policy"
      title="Change password"
      description={
        user.mustChangePassword
          ? 'Replace the temporary credential before operational access is enabled.'
          : 'Update your credential and revoke every existing session.'
      }
    >
      <div className="auth-account">
        <span>Signed in as</span>
        <strong>{user.displayName}</strong>
        <small>{user.email}</small>
      </div>
      <PasswordForm />
    </AuthFrame>
  );
}
