import Image from 'next/image';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { LanguageSwitcher } from '@/shared/ui/language-switcher';
import { SiteMapperBrand } from '@/shared/ui/site-mapper-brand';

function LoginMark() {
  return (
    <svg className="zip-login-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 4 56 17v30L32 60 8 47V17Z" />
      <path d="m8 17 24 14 24-14M32 31v29M20 24 43 11M20 24v16l12 8 12-8V24" />
      <path d="M21 25v7m0 0-3 2m3-2 3 1" />
    </svg>
  );
}

export function AuthFrame({
  title,
  description,
  children,
  showProviderBrand = false,
  heritageBrand = false,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  showProviderBrand?: boolean;
  heritageBrand?: boolean;
}>) {
  const t = useTranslations('shell');
  return (
    <main
      className={
        heritageBrand
          ? 'mk-login zip-login-page zip-login-page--heritage'
          : 'mk-login zip-login-page'
      }
    >
      <section className="mk-login-content zip-login-content">
        <header>
          {heritageBrand ? (
            <SiteMapperBrand variant="hero" tagline={t('tagline')} />
          ) : (
            <>
              <LoginMark />
              <div>
                <strong>SITE MAPPER</strong>
                <small>{t('tagline')}</small>
              </div>
            </>
          )}
        </header>
        <div className="mk-login-card zip-login-card" aria-label={title}>
          <h1 className="sr-only">{title}</h1>
          <p className="sr-only">{description}</p>
          {children}
        </div>
        <footer
          className={showProviderBrand ? 'zip-login-footer zip-login-footer--branded' : undefined}
        >
          <LanguageSwitcher />
          {showProviderBrand ? (
            <div className="zip-login-powered-by">
              <p>{t('poweredBy')}</p>
              <Image
                className="zip-login-thradex-logo"
                src="/brand/thradex-login.png"
                alt={t('thradex')}
                width={300}
                height={80}
                priority
              />
            </div>
          ) : null}
        </footer>
      </section>
    </main>
  );
}
