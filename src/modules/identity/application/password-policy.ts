import { createHash } from 'node:crypto';

export type PasswordPolicyResult =
  | 'ACCEPTED'
  | 'INVALID_INPUT'
  | 'PASSWORD_COMPROMISED'
  | 'PASSWORD_CHECK_UNAVAILABLE';

// Fast offline emergency denylist. It is NOT a replacement for the large,
// updated breached-password corpus available through k-anonymous screening.
const common = new Set([
  '123456789012',
  '1234567890123456',
  'adminadmin1234',
  'password123456',
  'passwordpassword',
  'qwerty123456',
  'qwertyuiop123',
  'welcome123456',
  'letmein123456',
  'iloveyou123456',
  'administrator123',
  'changeme123456',
  'defaultpassword',
  'secretpassword',
]);

/**
 * Screen newly chosen secrets only; never send plaintext passwords to a
 * remote service. HIBP range requests transmit only five SHA-1 hex digits.
 * Online failures reject the password change, never silently approve it.
 */
export async function assessNewPassword(
  password: string,
  mode = process.env.PASSWORD_BREACH_MODE ?? 'local',
  remoteFetch: typeof fetch = fetch,
): Promise<PasswordPolicyResult> {
  if (password.length < 12 || password.length > 1024) return 'INVALID_INPUT';
  if (common.has(password.trim().toLowerCase())) return 'PASSWORD_COMPROMISED';

  if (mode === 'local') return 'ACCEPTED';
  if (mode !== 'online') return 'PASSWORD_CHECK_UNAVAILABLE';

  const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const response = await remoteFetch('https://api.pwnedpasswords.com/range/' + prefix, {
      method: 'GET',
      headers: { 'Add-Padding': 'true', 'User-Agent': 'SiteMapper-MK1-Password-Policy' },
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return 'PASSWORD_CHECK_UNAVAILABLE';
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > 1_000_000)
      return 'PASSWORD_CHECK_UNAVAILABLE';
    const body = await response.text();
    if (body.length > 1_000_000) return 'PASSWORD_CHECK_UNAVAILABLE';
    for (const line of body.split('\n')) {
      const parts = line.trim().split(':');
      if (parts[0] === suffix && Number(parts[1]) > 0) return 'PASSWORD_COMPROMISED';
    }
    return 'ACCEPTED';
  } catch {
    return 'PASSWORD_CHECK_UNAVAILABLE';
  }
}
