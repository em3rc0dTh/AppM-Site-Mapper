'use client';

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

  return (
    <div className={`sm-brand sm-brand--${variant}`}>
      <div className="sm-brand-lockup">
        <BrandMark compact={compact} />
        <span className="sm-brand-copy">
          <strong className="sm-brand-name" aria-label="Site Mapper">
            <span className="sm-brand-word sm-brand-word--site">Site</span>
            <span className="sm-brand-word sm-brand-word--mapper">Mapper</span>
          </strong>
          <small className="sm-brand-tagline">{tagline}</small>
        </span>
      </div>
    </div>
  );
}
