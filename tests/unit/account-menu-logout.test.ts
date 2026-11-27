import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('account menu logout', () => {
  it('keeps logout available through the account menu without role gating', () => {
    const shell = source('src/shared/ui/app-shell.tsx');

    expect(shell).toContain('className="zip-account-menu"');
    expect(shell).toContain('aria-haspopup="menu"');
    expect(shell).toContain('className="zip-account-menu-item zip-account-signout"');
    expect(shell).toContain('void logout();');
    expect(shell).toContain("fetch('/api/auth/logout', { method: 'POST' })");

    const logoutBlock = shell.slice(
      shell.indexOf('async function logout()'),
      shell.indexOf('return ('),
    );
    expect(logoutBlock).not.toContain("role === 'ADMIN'");
    expect(logoutBlock).not.toContain("role === 'SUPERADMIN'");
  });

  it('exposes settings and explicit sign-out labels in both locales', () => {
    const es = source('src/messages/es.json');
    const en = source('src/messages/en.json');

    expect(es).toContain('"signOut": "Cerrar sesión"');
    expect(en).toContain('"signOut": "Sign out"');
  });
});
