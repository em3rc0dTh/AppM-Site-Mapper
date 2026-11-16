import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from '@/shared/http/content-security-policy';

describe('Content Security Policy', () => {
  it('uses a nonce and strict-dynamic without unsafe-inline scripts in production', () => {
    const csp = buildContentSecurityPolicy('nonce123=', false);

    const scriptPolicy = csp.split('; ').find((directive) => directive.startsWith('script-src '));
    expect(scriptPolicy).toBe("script-src 'self' 'nonce-nonce123=' 'strict-dynamic'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('permits unsafe-eval only for the Next.js development runtime', () => {
    const csp = buildContentSecurityPolicy('devNonce=', true);

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('rejects unsafe nonce material', () => {
    expect(() => buildContentSecurityPolicy("bad'; script-src *", false)).toThrow(
      'INVALID_CSP_NONCE',
    );
  });
});
