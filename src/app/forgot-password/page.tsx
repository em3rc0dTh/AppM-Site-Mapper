import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { AuthFrame } from '@/shared/ui/auth-frame';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgotPassword');

  return (
    <AuthFrame
      eyebrow={t('eyebrow')}
      title={t('title')}
      description={t('description')}
      showProviderBrand
      heritageBrand
    >
      <section className="auth-recovery">
        <h2>{t('title')}</h2>
        <p>{t('description')}</p>
        <ol>
          <li>{t('stepOne')}</li>
          <li>{t('stepTwo')}</li>
          <li>{t('stepThree')}</li>
        </ol>
        <p className="auth-recovery-note">{t('note')}</p>
        <Link className="auth-submit auth-recovery-back" href="/login">
          {t('back')}
        </Link>
      </section>
    </AuthFrame>
  );
}
