import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { SiteMapperBrand } from '@/shared/ui/site-mapper-brand';

import './workbench.css';
import './power-trace.css';

export default async function WorkbenchLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const t = await getTranslations('shell');

  return (
    <div className="sm-workbench-shell">
      <header className="sm-workbench-brandbar">
        <Link
          href="/workspace"
          className="sm-workbench-brand-link"
          aria-label={t('goHome')}
          title={t('goHome')}
        >
          <SiteMapperBrand variant="compact" tagline={t('tagline')} />
          <span className="sm-workbench-brand-home" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" />
            </svg>
          </span>
        </Link>
      </header>
      {children}
    </div>
  );
}
