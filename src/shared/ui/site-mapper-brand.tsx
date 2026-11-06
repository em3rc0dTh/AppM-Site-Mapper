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

function NetworkBackdrop() {
  return (
    <svg
      className="sm-brand-network"
      viewBox="0 0 1200 260"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g className="sm-brand-network-map">
        <path d="M76 42 231 93 386 57 526 118 708 62 876 104 1119 45" />
        <path d="M43 197 198 142 340 180 486 122 640 181 793 137 954 190 1163 126" />
        <path d="M231 93 198 142M386 57 340 180M526 118 486 122M708 62 640 181M876 104 793 137M1119 45 954 190" />
        <path d="M76 42 340 180M231 93 486 122M386 57 640 181M526 118 793 137M708 62 954 190M876 104 1163 126" />
      </g>
      <g className="sm-brand-network-nodes">
        <circle cx="76" cy="42" r="4" />
        <circle cx="231" cy="93" r="4" />
        <circle cx="386" cy="57" r="4" />
        <circle cx="526" cy="118" r="4" />
        <circle cx="708" cy="62" r="4" />
        <circle cx="876" cy="104" r="4" />
        <circle cx="1119" cy="45" r="4" />
        <circle cx="43" cy="197" r="4" />
        <circle cx="198" cy="142" r="4" />
        <circle cx="340" cy="180" r="4" />
        <circle cx="486" cy="122" r="4" />
        <circle cx="640" cy="181" r="4" />
        <circle cx="793" cy="137" r="4" />
        <circle cx="954" cy="190" r="4" />
        <circle cx="1163" cy="126" r="4" />
      </g>
      <g className="sm-brand-network-ticks">
        <path d="M150 54v18m98 18v22m78-48v18m110 20v26m121-28v20m98-45v20m95 27v22m104-31v18m91-51v21" />
        <path d="M111 163v18m112-43v18m102 18v20m112-79v18m116 40v22m114-65v20m102-21v18m116 34v22m126-70v20" />
      </g>
    </svg>
  );
}

export function SiteMapperBrand({ variant, tagline }: SiteMapperBrandProps) {
  const compact = variant === 'compact';

  return (
    <div className={`sm-brand sm-brand--${variant}`}>
      {variant === 'hero' ? <NetworkBackdrop /> : null}
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
