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

/** MK2 navigation contract: the frame is visual; only the Home icon navigates. */
export const SiteMapperProductHeader = forwardRef<HTMLDivElement, SiteMapperProductHeaderProps>(
  function SiteMapperProductHeader({ tagline, ariaLabel, title = ariaLabel, className = '' }, ref) {
    return (
      <div ref={ref} className={['sm-product-header', className].filter(Boolean).join(' ')}>
        <Link
          href="/workspace"
          className="sm-product-header-home"
          aria-label={ariaLabel}
          title={title}
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" />
          </svg>
        </Link>
        <SiteMapperBrand variant="compact" tagline={tagline} />
      </div>
    );
  },
);
