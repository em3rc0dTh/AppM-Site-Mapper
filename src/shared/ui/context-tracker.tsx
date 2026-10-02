'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { isWorkspaceHref } from '@/modules/workspace/domain/context';

export function ContextTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const timer = setTimeout(() => {
      const href = `${pathname}${window.location.search}`;
      if (!isWorkspaceHref(href)) return;

      const name = document.querySelector('main h1')?.textContent?.trim() || 'Infrastructure';
      void fetch('/api/workspace/context', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ href, name: name.slice(0, 160) }),
      }).catch(() => {});
    }, 400);

    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
