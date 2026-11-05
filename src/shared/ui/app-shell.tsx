'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Role } from '@/modules/identity/domain/roles';

import { CommandPalette } from './command-palette';
import { ContextTracker } from './context-tracker';
import { ContextualHelp } from '@/modules/help/components/contextual-help';
import { AlarmHeaderBadge } from '@/components/alarm/alarm-header-badge';

function BrandMark() {
  return (
    <svg className="zip-brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 4 56 17v30L32 60 8 47V17Z" />
      <path d="m8 17 24 14 24-14M32 31v29M20 24 43 11M20 24v16l12 8 12-8V24" />
      <path d="M21 25v7m0 0-3 2m3-2 3 1" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  // The root layout persists across client-side login/navigation. Resolve the
  // current role in the shell so a STANDARD user never sees the ADMIN label.
  useEffect(() => {
    if (pathname === '/login' || pathname === '/change-password') return;
    const controller = new AbortController();
    void fetch('/api/auth/session', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { user?: { role?: Role } };
        return data.user?.role ?? null;
      })
      .then((nextRole) => {
        if (!controller.signal.aborted) {
          setRole(
            nextRole === 'SUPERADMIN' || nextRole === 'ADMIN' || nextRole === 'STANDARD'
              ? nextRole
              : null,
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setRole(null);
      });
    return () => controller.abort();
  }, [pathname]);

  useEffect(() => {
    const shell = shellRef.current;
    const brand = brandRef.current;
    const actions = actionsRef.current;
    if (!shell || !brand || !actions) return;

    const syncTopbarGeometry = () => {
      shell.style.setProperty(
        '--s03-topbar-brand-width',
        `${Math.ceil(brand.getBoundingClientRect().width)}px`,
      );
      shell.style.setProperty(
        '--s03-topbar-actions-width',
        `${Math.ceil(actions.getBoundingClientRect().width)}px`,
      );
    };

    syncTopbarGeometry();
    const observer = new ResizeObserver(syncTopbarGeometry);
    observer.observe(brand);
    observer.observe(actions);
    return () => observer.disconnect();
  }, [pathname]);

  if (pathname === '/login' || pathname === '/change-password' || pathname.startsWith('/workbench'))
    return children;

  const blueprint = pathname.startsWith('/blueprint');
  const power = pathname.startsWith('/power');
  const powerConnect = pathname === '/power/connect/equipment';
  const immersive =
    pathname.startsWith('/topology') ||
    blueprint ||
    pathname.startsWith('/rack') ||
    pathname.startsWith('/device') ||
    power ||
    pathname === '/network';

  const contextLabel = pathname.startsWith('/help')
    ? t('helpCenter')
    : pathname.startsWith('/settings')
      ? t('settings')
      : pathname.startsWith('/warehouse')
        ? t('warehouseContext')
        : pathname === '/workspace'
          ? ''
          : t('networkContext');

  async function logout() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      setRole(null);
      router.replace('/login');
      router.refresh();
    } catch {
      setError(t('signOutError'));
      setBusy(false);
    }
  }

  return (
    <div
      ref={shellRef}
      className={[
        'app-shell',
        'zip-app-shell',
        immersive ? 'app-shell--immersive' : '',
        blueprint ? 'app-shell--blueprint' : '',
        power ? 'app-shell--power' : '',
        powerConnect ? 'app-shell--power-connect' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <a className="skip-link" href="#main-content">
        {t('skip')}
      </a>

      <header className="app-topbar zip-topbar">
        <Link ref={brandRef} href="/workspace" className="zip-brand">
          <BrandMark />
          <span>
            <strong>SITE MAPPER</strong>
            <small>{t('tagline')}</small>
          </span>
        </Link>

        <div className="zip-context-slot">
          {!immersive ? <div className="zip-static-context">{contextLabel}</div> : null}
        </div>

        <Suspense fallback={null}>
          <ContextTracker />
        </Suspense>

        <div ref={actionsRef} className="zip-topbar-actions">
          <CommandPalette />
          <ContextualHelp key={pathname} />
          <AlarmHeaderBadge />

          <Link className="zip-explore" href="/network">
            {t('explore')} <b>⌄</b>
          </Link>
          <Link className="zip-warehouse" href="/warehouse">
            {t('warehouse')}
          </Link>
          <Link className="zip-account" href="/settings">
            {role === 'ADMIN' || role === 'SUPERADMIN' ? t('admin') : t('myAccount')} <b>⌄</b>
          </Link>
          <button
            className="zip-more"
            disabled={busy}
            onClick={logout}
            aria-label={t('signOut')}
            title={t('signOut')}
          >
            {busy ? '…' : '⋮'}
          </button>
        </div>
      </header>

      <div className="app-content zip-app-content" id="main-content" tabIndex={-1}>
        {error ? (
          <p className="form-error zip-shell-error" role="alert">
            {error}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
