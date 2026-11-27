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
import { SiteMapperProductHeader } from './site-mapper-product-header';

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // The root layout persists across client-side login/navigation. Resolve the
  // current role in the shell so a STANDARD user never sees the ADMIN label.
  useEffect(() => {
    if (pathname === '/login' || pathname === '/change-password' || pathname === '/forgot-password')
      return;
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
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (
      pathname === '/login' ||
      pathname === '/change-password' ||
      pathname === '/forgot-password' ||
      pathname.startsWith('/live-inspector')
    )
      return;

    const listener = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'm'
      )
        return;

      event.preventDefault();
      const url = new URL('/live-inspector', window.location.origin);
      url.searchParams.set('from', pathname);

      const width = Math.min(1480, Math.max(1080, window.screen.availWidth - 120));
      const height = Math.min(980, Math.max(760, window.screen.availHeight - 120));
      const left = Math.max(0, window.screenX + Math.round((window.outerWidth - width) / 2));
      const top = Math.max(0, window.screenY + 40);

      const opened = window.open(
        url.toString(),
        'site-mapper-live-inspector',
        [
          'popup=yes',
          `width=${width}`,
          `height=${height}`,
          `left=${left}`,
          `top=${top}`,
          'resizable=yes',
          'scrollbars=yes',
        ].join(','),
      );
      opened?.focus();
    };

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
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

  if (
    pathname === '/login' ||
    pathname === '/change-password' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/workbench') ||
    pathname.startsWith('/live-inspector')
  )
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
        <SiteMapperProductHeader
          ref={brandRef}
          tagline={t('tagline')}
          ariaLabel={t('goHome')}
          className="zip-brand"
        />

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
          <div className="zip-account-menu" ref={accountMenuRef}>
            <button
              type="button"
              className="zip-account"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((open) => !open)}
            >
              {role === 'ADMIN' || role === 'SUPERADMIN' ? t('admin') : t('myAccount')}{' '}
              <b aria-hidden="true">{accountOpen ? '⌃' : '⌄'}</b>
            </button>

            {accountOpen ? (
              <div className="zip-account-dropdown" role="menu">
                <Link
                  className="zip-account-menu-item"
                  href="/settings"
                  role="menuitem"
                  onClick={() => setAccountOpen(false)}
                >
                  {t('settings')}
                </Link>
                <button
                  type="button"
                  className="zip-account-menu-item zip-account-signout"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setAccountOpen(false);
                    void logout();
                  }}
                >
                  {busy ? '…' : t('signOut')}
                </button>
              </div>
            ) : null}
          </div>
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
