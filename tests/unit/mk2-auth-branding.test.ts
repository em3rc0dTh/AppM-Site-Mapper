import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Mk2 authentication branding', () => {
  it('keeps login and forced first-login password rotation on the AppManager SiteMapper Mk2 shell', () => {
    const login = source('src/app/login/page.tsx');
    const changePassword = source('src/app/change-password/page.tsx');

    expect(login).toContain('showProviderBrand');
    expect(login).toContain('heritageBrand');

    expect(changePassword).toContain('showProviderBrand');
    expect(changePassword).toContain('heritageBrand');
    expect(changePassword).toContain('<PasswordForm presentation="auth" />');
  });

  it('does not change the normal Settings password form presentation', () => {
    const settings = source('src/app/settings/page.tsx');
    expect(settings).toContain('<PasswordForm />');
    expect(settings).not.toContain('<PasswordForm presentation="auth" />');
  });

  it('keeps the legacy SITE MAPPER mark behind the non-heritage AuthFrame branch only', () => {
    const frame = source('src/shared/ui/auth-frame.tsx');
    expect(frame).toContain('heritageBrand');
    expect(frame).toContain("'mk-login zip-login-page zip-login-page--heritage'");
    expect(frame).toContain('<SiteMapperBrand variant="hero" tagline={t(\'tagline\')} />');
    expect(frame).toContain('<strong>SITE MAPPER</strong>');
  });
});
