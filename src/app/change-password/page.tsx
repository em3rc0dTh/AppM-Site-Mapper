import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PasswordForm } from '@/components/settings/password-form';
import { getCurrentSessionUser } from '@/modules/identity/application/current-session';
import { AuthFrame } from '@/shared/ui/auth-frame';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await getCurrentSessionUser();

  if (!user) {
    redirect('/login');
  }

  const t = await getTranslations('auth.changePassword');

  return (
    <AuthFrame
      eyebrow={t('eyebrow')}
      title={t('title')}
      description={user.mustChangePassword ? t('forcedDescription') : t('description')}
    >
      <div className="auth-account">
        <span>{t('signedInAs')}</span>
        <strong>{user.displayName}</strong>
        <small>{user.email}</small>
      </div>
      <PasswordForm />
    </AuthFrame>
  );
}
