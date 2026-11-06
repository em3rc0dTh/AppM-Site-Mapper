import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Josefin_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

import './globals.css';
import './legacy-fidelity.css';
import './telxius-ui.css';
import './mk1.css';
import './visual-parity.css';
import './room-light.css';
import './interaction-recovery.css';
import './spatial-editor.css';
import './home-redesign.css';
import './equipment-composition-contract.css';
import './laptop-responsive.css';
import './language-switcher.css';
import './operational-light-theme.css';
import './light-theme-contract.css';
import './help.css';
import './s03-workspace.css';
import './s04-branding.css';
import './site-mapper-brand.css';
import { AppShell } from '@/shared/ui/app-shell';

const siteMapperBrandFont = Josefin_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-site-mapper-brand',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: 'AppManager SiteMapper Mk2',
    applicationName: 'AppManager SiteMapper Mk2',
    description: t('description'),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Nonce-based CSP requires per-request dynamic rendering. Without it,
  // Next.js may serve HTML whose inline scripts lack the request nonce.
  await headers();
  const locale = await getLocale();
  return (
    <html lang={locale} data-theme="light" className={siteMapperBrandFont.variable}>
      <body>
        <NextIntlClientProvider>
          <AppShell>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
