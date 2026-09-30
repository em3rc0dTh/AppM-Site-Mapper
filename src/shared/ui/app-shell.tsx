'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { CommandPalette } from './command-palette';
import { ContextTracker } from './context-tracker';

function SiteMapperMark() {
  return (
    <svg className="zip-brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 28 9v14l-12 7L4 23V9Z" />
      <path d="m4 9 12 7 12-7M16 16v14M10 12l12-7M10 12v8l6 4 6-4v-8" />
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
  const settings = pathname.startsWith('/settings');
  const power = pathname.startsWith('/power');
  const immersive =
    pathname.startsWith('/topology') ||
    pathname.startsWith('/blueprint') ||
    pathname.startsWith('/rack') ||
    pathname.startsWith('/device') ||
    pathname.startsWith('/power');

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
        settings ? 'app-shell--settings' : '',
        power ? 'app-shell--power' : '',
      ].join(' ')}
    >
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>

      <header className="app-topbar zip-topbar">
        <Link href="/workspace" className="zip-brand">
          <SiteMapperMark />
          <span>
            <strong>{blueprint ? 'AppManager' : 'SITE MAPPER'}</strong>
            <small>{blueprint ? 'SiteMapper Module' : 'Physical Infrastructure'}</small>
          </span>
        </Link>

        {settings ? <div className="zip-static-context">SETTINGS</div> : <div className="zip-context-slot" />}

        <ContextTracker />
        <CommandPalette />

        <Link href="/network" className="zip-explore">
          <span aria-hidden="true">⌑</span>
          EXPLORE
          <b aria-hidden="true">⌄</b>
        </Link>

        {settings ? (
          <button className="zip-account" type="button" onClick={logout} disabled={busy}>
            <span aria-hidden="true">◎</span>
            {busy ? '…' : 'Account'}
            <b aria-hidden="true">⌄</b>
          </button>
        ) : (
          <button className="zip-more" type="button" onClick={logout} disabled={busy} aria-label="Sign out">
            {busy ? '…' : '•••'}
          </button>
        )}
      </header>

      <div className="app-content zip-app-content" id="main-content" tabIndex={-1}>
        {error && (
          <p className="form-error zip-shell-error" role="alert">
            {error}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
