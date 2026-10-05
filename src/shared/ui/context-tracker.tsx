'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { isWorkspaceHref } from '@/modules/workspace/domain/context';

let lastTrackedHref: string | null = null;

export function ContextTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    const href = `${pathname}${search ? `?${search}` : ''}`;
    if (!isWorkspaceHref(href) || href === lastTrackedHref) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (href === lastTrackedHref) return;
      lastTrackedHref = href;

      const name = document.querySelector('main h1')?.textContent?.trim() || 'Infrastructure';
      void fetch('/api/workspace/context', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ href, name: name.slice(0, 160) }),
        signal: controller.signal,
      }).catch(() => {
        if (!controller.signal.aborted && lastTrackedHref === href) lastTrackedHref = null;
      });
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pathname, search]);

  return null;
}
