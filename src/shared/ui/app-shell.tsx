'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { CommandPalette } from './command-palette';
import { ContextTracker } from './context-tracker';

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
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (pathname === '/login' || pathname === '/change-password') return children;

  const blueprint = pathname.startsWith('/blueprint');
  const power = pathname.startsWith('/power');
  const immersive =
    pathname.startsWith('/topology') ||
    blueprint ||
    pathname.startsWith('/rack') ||
    pathname.startsWith('/device') ||
    power ||
    pathname === '/network';

  const contextLabel = pathname.startsWith('/settings')
    ? 'SETTINGS'
    : pathname.startsWith('/warehouse')
      ? 'VIRTUAL WAREHOUSE'
      : pathname === '/workspace'
        ? 'OPERATIONS'
        : 'NETWORK';

  async function logout() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      router.replace('/login');
      router.refresh();
    } catch {
      setError('Could not sign out. Try again.');
      setBusy(false);
    }
  }

  return (
    <div
      className={[
        'app-shell',
        'zip-app-shell',
        immersive ? 'app-shell--immersive' : '',
        blueprint ? 'app-shell--blueprint' : '',
        power ? 'app-shell--power' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>

      <header className="app-topbar zip-topbar">
        <Link href="/workspace" className="zip-brand">
          <BrandMark />
          <span>
            <strong>SITE MAPPER</strong>
            <small>Physical Infrastructure</small>
          </span>
        </Link>

        <div className="zip-context-slot">
          {!immersive ? <div className="zip-static-context">{contextLabel}</div> : null}
        </div>

        <ContextTracker />
        <CommandPalette />

        <Link className="zip-explore" href="/network">
          EXPLORE <b>⌄</b>
        </Link>
        <Link className="zip-warehouse" href="/warehouse">
          WAREHOUSE
        </Link>
        <Link className="zip-account" href="/settings">
          ADMIN <b>⌄</b>
        </Link>
        <button
          className="zip-more"
          disabled={busy}
          onClick={logout}
          aria-label="Sign out"
          title="Sign out"
        >
          {busy ? '…' : '⋮'}
        </button>
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
