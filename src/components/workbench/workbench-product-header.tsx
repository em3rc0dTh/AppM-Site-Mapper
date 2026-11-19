'use client';

import { usePathname } from 'next/navigation';

import { SiteMapperBrand } from '@/shared/ui/site-mapper-brand';
import { SiteMapperProductHeader } from '@/shared/ui/site-mapper-product-header';

type WorkbenchProductHeaderProps = {
  readonly tagline: string;
  readonly ariaLabel: string;
};

export function WorkbenchProductHeader({
  tagline,
  ariaLabel,
}: Readonly<WorkbenchProductHeaderProps>) {
  const pathname = usePathname();
  const detachedPoweredEquipment = pathname.startsWith('/workbench/powered-equipment');

  if (detachedPoweredEquipment) {
    return (
      <div className="sm-product-header sm-product-header--static" aria-label={ariaLabel}>
        <SiteMapperBrand variant="compact" tagline={tagline} />
      </div>
    );
  }

  return <SiteMapperProductHeader tagline={tagline} ariaLabel={ariaLabel} />;
}
