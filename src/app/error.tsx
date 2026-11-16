'use client';
import { useTranslations } from 'next-intl';
import { StatePanel } from '@/shared/ui/primitives';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations('systemStates');
  return (
    <StatePanel
      kind="error"
      title={t('errorTitle')}
      description={t('errorHelp')}
      action={
        <button type="button" onClick={reset}>
          {t('retry')}
        </button>
      }
    />
  );
}
