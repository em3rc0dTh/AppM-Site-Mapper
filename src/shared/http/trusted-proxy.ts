import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/** The edge must strip client copies and inject this private proof. Never trust
 * forwarded headers merely because a client supplied a plausible address. */
export function hasTrustedProxy(request: Request): boolean {
  const secret = process.env.AUTH_TRUSTED_PROXY_TOKEN;
  if (!secret || secret.length < 32) return false;
  const proof = request.headers.get('x-appm-proxy-token') ?? '';
  const expected = Buffer.from(secret);
  const supplied = Buffer.from(proof);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function trustedClientAddress(request: Request): string {
  if (!hasTrustedProxy(request)) return 'untrusted-edge';
  // Require one canonical address injected by the authenticated edge, not a client chain.
  const address = request.headers.get('x-appm-client-ip')?.trim() ?? '';
  return isIP(address) ? address : 'untrusted-edge';
}
