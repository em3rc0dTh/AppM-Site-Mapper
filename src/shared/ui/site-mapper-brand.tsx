'use client';

import { useTranslations } from 'next-intl';

type SiteMapperBrandProps = {
  readonly variant: 'compact' | 'hero';
  readonly tagline: string;
};

function BrandMark({ compact = false }: { readonly compact?: boolean }) {
  return (
    <svg
      className={compact ? 'zip-brand-mark sm-brand-mark' : 'sm-brand-mark'}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <path d="M32 4 56 17v30L32 60 8 47V17Z" />
      <path d="m8 17 24 14 24-14M32 31v29M20 24 43 11M20 24v16l12 8 12-8V24" />
      <path d="M21 25v7m0 0-3 2m3-2 3 1" />
    </svg>
  );
}

export function SiteMapperBrand({ variant, tagline }: SiteMapperBrandProps) {
  const compact = variant === 'compact';
  const t = useTranslations('brand');
  const appManager = t('appManager');
  const siteMapper = t('siteMapper');
  const generation = t('generation');

  return (
    <div className={`sm-brand sm-brand--${variant}`}>
      <div className="sm-brand-lockup">
        <BrandMark compact={compact} />
        <span className="sm-brand-copy">
          <strong className="sm-brand-appmanager" aria-label={appManager}>
            <span className="sm-brand-appmanager-a">{appManager.slice(0, 1)}</span>
            <span>{appManager.slice(1)}</span>
          </strong>
          <span
            className="sm-brand-product-line"
            aria-label={`${siteMapper} ${generation}`}
          >
            <span className="sm-brand-sitemapper">{siteMapper}</span>
            <span className="sm-brand-mk">{generation}</span>
          </span>
          <small className="sm-brand-tagline">{tagline}</small>
        </span>
      </div>
    </div>
  );
}
