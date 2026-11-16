'use client';

import Link from 'next/link';
import { forwardRef } from 'react';

import { SiteMapperBrand } from './site-mapper-brand';

type SiteMapperProductHeaderProps = {
  readonly tagline: string;
  readonly ariaLabel: string;
  readonly title?: string;
  readonly className?: string;
};

export const SiteMapperProductHeader = forwardRef<HTMLAnchorElement, SiteMapperProductHeaderProps>(
  function SiteMapperProductHeader({ tagline, ariaLabel, title = ariaLabel, className = '' }, ref) {
    return (
      <Link
        ref={ref}
        href="/workspace"
        className={['sm-product-header', className].filter(Boolean).join(' ')}
        aria-label={ariaLabel}
        title={title}
      >
        <SiteMapperBrand variant="compact" tagline={tagline} />
        <span className="sm-product-header-home" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" />
          </svg>
        </span>
      </Link>
    );
  },
);
