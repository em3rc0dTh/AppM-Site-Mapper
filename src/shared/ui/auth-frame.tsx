import type { ReactNode } from 'react';

function LoginMark() {
  return (
    <svg className="zip-login-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 4 56 17v30L32 60 8 47V17Z" />
      <path d="m8 17 24 14 24-14M32 31v29M20 24 43 11M20 24v16l12 8 12-8V24" />
      <path d="M21 25v7m0 0-3 2m3-2 3 1" />
    </svg>
  );
}

export function AuthFrame({
  title,
  description,
  children,
}: Readonly<{ eyebrow: string; title: string; description: string; children: ReactNode }>) {
  return (
    <main className="mk-login zip-login-page">
      <section className="mk-login-content zip-login-content">
        <header>
          <LoginMark />
          <div>
            <strong>SITE MAPPER</strong>
            <small>Physical Infrastructure</small>
          </div>
        </header>
        <div className="mk-login-card zip-login-card" aria-label={title}>
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
