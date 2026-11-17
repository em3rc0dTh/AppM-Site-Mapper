import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Mk2 authentication branding and recovery', () => {
  it('keeps login, recovery and forced first-password rotation on the branded auth shell', () => {
    const login = source('src/app/login/page.tsx');
    const forgot = source('src/app/forgot-password/page.tsx');
    const changePassword = source('src/app/change-password/page.tsx');

    expect(login).toContain('showProviderBrand');
    expect(login).toContain('heritageBrand');
    expect(login).toContain('href="/forgot-password"');

    expect(forgot).toContain('showProviderBrand');
    expect(forgot).toContain('heritageBrand');
    expect(forgot).toContain('href="/login"');

    expect(changePassword).toContain('showProviderBrand');
    expect(changePassword).toContain('heritageBrand');
    expect(changePassword).toContain(
      '<PasswordForm presentation="auth" forced={user.mustChangePassword} />',
    );
  });

  it('requires confirmation for the new password in the shared password form', () => {
    const form = source('src/components/settings/password-form.tsx');
    expect(form).toContain('name="confirmPassword"');
    expect(form).toContain("newPassword !== confirmPassword");
    expect(form).toContain("forced ? t('temporary') : t('current')");
  });

  it('keeps the normal Settings password form presentation', () => {
    const settings = source('src/app/settings/page.tsx');
    expect(settings).toContain('<PasswordForm />');
  });

  it('keeps the legacy SITE MAPPER mark behind the non-heritage AuthFrame branch only', () => {
    const frame = source('src/shared/ui/auth-frame.tsx');
    expect(frame).toContain('heritageBrand');
    expect(frame).toContain("'mk-login zip-login-page zip-login-page--heritage'");
    expect(frame).toContain('<SiteMapperBrand variant="hero" tagline={t(\'tagline\')} />');
    expect(frame).toContain('<strong>SITE MAPPER</strong>');
  });
});
