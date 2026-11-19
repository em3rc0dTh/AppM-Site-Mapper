import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { WorkbenchProductHeader } from '@/components/workbench/workbench-product-header';

import './workbench.css';
import './power-trace.css';
import './powered-equipment.css';

export default async function WorkbenchLayout({ children }: Readonly<{ children: ReactNode }>) {
  const t = await getTranslations('shell');

  return (
    <div className="sm-workbench-shell">
      <header className="sm-workbench-brandbar">
        <WorkbenchProductHeader tagline={t('tagline')} ariaLabel={t('goHome')} />
      </header>
      {children}
    </div>
  );
}
