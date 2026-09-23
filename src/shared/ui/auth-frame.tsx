import type { ReactNode } from 'react';

import { Icon, StatusBadge } from './primitives';

export function AuthFrame({
  eyebrow,
  title,
  description,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}>) {
  return (
    <main className="auth-shell">
      <aside className="auth-stage" aria-label="Site Mapper identity">
        <div className="auth-brand">
          <span className="brand-mark">
            <Icon name="network" />
          </span>
          <span>
            SITE MAPPER
            <small>INFRASTRUCTURE OPERATIONS</small>
          </span>
        </div>

        <div className="auth-stage-copy">
          <p className="eyebrow">APP MANAGER / CONTROL CENTER</p>
          <h2>Physical infrastructure. One trusted operational view.</h2>
          <p>
            Topology, rack capacity, power and telemetry share the same certified MK1 domain.
          </p>
        </div>

        <div className="auth-proof-grid" aria-label="Platform capabilities">
          <div className="auth-proof">
            <span>01</span>
            <strong>TOPOLOGY</strong>
            <small>Canonical physical hierarchy</small>
          </div>
          <div className="auth-proof">
            <span>02</span>
            <strong>POWER</strong>
            <small>Explicit distribution paths</small>
          </div>
          <div className="auth-proof">
            <span>03</span>
            <strong>TELEMETRY</strong>
            <small>Authenticated realtime stream</small>
          </div>
        </div>
      </aside>

      <section className="auth-panel">
        <div className="auth-panel-status">
          <StatusBadge tone="good">SECURE SESSION</StatusBadge>
          <span>MK1</span>
        </div>
        <div className="auth-card">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
