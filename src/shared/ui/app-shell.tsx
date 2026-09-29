'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { CommandPalette } from './command-palette';
import { ContextTracker } from './context-tracker';
import { Icon } from './primitives';

const links = [
  { href: '/workspace', label: 'Workspace', icon: 'workspace' },
  { href: '/network', label: 'Network', icon: 'network' },
  { href: '/power', label: 'Power', icon: 'power' },
  { href: '/telemetry', label: 'Telemetry', icon: 'telemetry' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (pathname === '/login' || pathname === '/change-password') return children;

  const immersive =
    pathname.startsWith('/topology') ||
    pathname.startsWith('/blueprint') ||
    pathname.startsWith('/rack') || pathname.startsWith('/device') || pathname.startsWith('/power');

  const active =
    immersive || pathname === '/network'
      ? '/network'
      : pathname.startsWith('/power')
        ? '/power'
        : pathname.startsWith('/telemetry')
          ? '/telemetry'
          : '/workspace';

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
    <div className={`app-shell legacy-shell ${immersive ? 'app-shell--immersive' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>

      <header className="app-topbar legacy-topbar">
        <Link href="/workspace" className="legacy-brand telxius-brand">
          <strong>⬡ SITE MAPPER</strong>
          <span>Physical Infrastructure</span>
        </Link>

        <div className="telxius-topbar-context" aria-hidden="true">
          <span>NETWORK</span>
          <b>›</b>
          <span>SITE MAPPER</span>
        </div>

        <ContextTracker /><CommandPalette /><div className="legacy-top-actions">
          <Link href="/settings" className="legacy-icon-button" aria-label="Settings">
            <Icon name="settings" />
          </Link>
          <button
            className="legacy-signout telxius-user-button"
            disabled={busy}
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
          >
            {busy ? '…' : '◎'}
          </button>
        </div>
      </header>

      {!immersive && (
        <aside className="app-rail legacy-primary-rail">
          <div className="legacy-rail-heading">
            <span className="legacy-rail-heading-icon">
              <Icon name="network" />
            </span>
            <div>
              <strong>Operations</strong>
              <small>SiteMapper workspace</small>
            </div>
          </div>

          <nav aria-label="Main navigation">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active === link.href ? 'page' : undefined}
              >
                <Icon name={link.icon} />
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>

          <div className="legacy-rail-footer">
            <Link href="/settings">
              <Icon name="settings" />
              <span>Settings</span>
            </Link>
          </div>
        </aside>
      )}

      <div className="app-content" id="main-content" tabIndex={-1}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
