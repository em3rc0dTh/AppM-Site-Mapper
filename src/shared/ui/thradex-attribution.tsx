import { useTranslations } from 'next-intl';

export function ThradexAttribution({
  variant = 'page',
}: Readonly<{ variant?: 'page' | 'inspector' }>) {
  const t = useTranslations('shell');
  return (
    <div
      className={`sm-thradex-attribution sm-thradex-attribution--${variant}`}
      aria-label={t('poweredByThradex')}
    >
      <span>{t('poweredBy')}</span>
      <strong>{t('thradex')}</strong>
    </div>
  );
}
