'use client';

import type { ReactNode } from 'react';

export function PopupChrome({
  eyebrow,
  title,
  subtitle,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}>) {
  return (
    <main className="physical-popup-shell">
      <header className="physical-popup-header">
        <div>
          <small>{eyebrow}</small>
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <button type="button" aria-label="Close popup" onClick={() => window.close()}>
          ×
        </button>
      </header>
      <div className="physical-popup-body">{children}</div>
    </main>
  );
}
