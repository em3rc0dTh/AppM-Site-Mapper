'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Icon } from './primitives';

const links = [
  { href: '/workspace', label: 'Workspace', icon: 'workspace', number: '01' },
  { href: '/network', label: 'Network', icon: 'network', number: '02' },
  { href: '/power', label: 'Power', icon: 'power', number: '03' },
  { href: '/telemetry', label: 'Telemetry', icon: 'telemetry', number: '04' },
  { href: '/settings', label: 'Settings', icon: 'settings', number: '05' },
];
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (pathname === '/login' || pathname === '/change-password') return children;
  const active =
    pathname.startsWith('/topology') ||
    pathname.startsWith('/blueprint') ||
    pathname.startsWith('/rack')
      ? '/network'
      : pathname;
  const current = links.find((link) => link.href === active)?.label ?? 'Operations';
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
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <header className="app-topbar">
        <Link href="/workspace" className="brand">
          <span className="brand-mark">
            <Icon name="network" />
          </span>
          <span>
            SITE MAPPER<small>INFRASTRUCTURE OPERATIONS</small>
          </span>
        </Link>
        <div className="topbar-context">
          <span>MK1</span>
          <span className="topbar-divider" />
          {current}
        </div>
        <button className="button-quiet" disabled={busy} onClick={logout}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </header>
      <aside className="app-rail">
        <p className="eyebrow rail-label">Control center</p>
        <nav aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active === link.href ? 'page' : undefined}
            >
              <Icon name={link.icon} />
              <span>{link.label}</span>
              <small>{link.number}</small>
            </Link>
          ))}
        </nav>
        <div className="rail-footer">
          <span className="rail-grid" />
          <p>
            Physical infrastructure.
            <br />
            One operational view.
          </p>
          <small>SITE MAPPER / MK1</small>
        </div>
      </aside>
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
