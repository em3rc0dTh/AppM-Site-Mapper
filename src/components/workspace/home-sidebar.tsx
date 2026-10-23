'use client';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
export function HomeSidebar({ tree }: { tree: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations('homeSidebar');
  return (
    <aside className={`sm-home-sidebar ${expanded ? 'is-open' : ''}`}>
      <button
        type="button"
        className="sm-home-sidebar-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-label={expanded ? t('collapse') : t('expand')}
        aria-expanded={expanded}
      >
        ☰
      </button>
      {expanded && tree}
    </aside>
  );
}
