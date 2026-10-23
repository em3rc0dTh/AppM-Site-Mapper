'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StatePanel } from '@/shared/ui/primitives';
export default function NotFound() {
  const t = useTranslations('systemStates');
  return (
    <StatePanel
      title={t('notFoundTitle')}
      description={t('notFoundHelp')}
      action={
        <Link className="action-link" href="/network">
          {t('network')}
        </Link>
      }
    />
  );
}
