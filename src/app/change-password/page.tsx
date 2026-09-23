import { redirect } from 'next/navigation';

import { PasswordForm } from '@/components/settings/password-form';
import { getCurrentSessionUser } from '@/modules/identity/application/current-session';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await getCurrentSessionUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="shell">
      <section className="login-card">
        <p className="eyebrow">AppManager · Site Mapper</p>
        <h1>Change password</h1>
        <p>
          {user.mustChangePassword
            ? 'A new password is required before operational access is enabled.'
            : 'Update your password and revoke every existing session.'}
        </p>
        <PasswordForm />
      </section>
    </main>
  );
}
