'use client';

import { useTranslations } from 'next-intl';
import { StatePanel } from '@/shared/ui/primitives';
export default function Loading() {
  const t = useTranslations('systemStates');
  return (
    <StatePanel
      kind="loading"
      title={t('loadingTitle')}
      description={t('loadingHelp')}
    />
  );
}
