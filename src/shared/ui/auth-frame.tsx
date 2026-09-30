import type { ReactNode } from 'react';
export function AuthFrame({
  title,
  description,
  children,
}: Readonly<{ eyebrow: string; title: string; description: string; children: ReactNode }>) {
  return (
    <main className="mk-login">
      <section className="mk-login-content">
        <header>
          <span aria-hidden="true">⬡</span>
          <div>
            <strong>SITE MAPPER</strong>
            <small>Physical Infrastructure</small>
          </div>
        </header>
        <div className="mk-login-card" aria-label={title}>
          <h1 className="sr-only">{title}</h1>
          <p className="sr-only">{description}</p>
          {children}
        </div>
        <footer>
          System <span>●</span> Available
        </footer>
      </section>
    </main>
  );
}
