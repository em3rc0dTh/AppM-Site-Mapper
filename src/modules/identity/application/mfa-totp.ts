import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function createMfaSecret(): string {
  const bytes = randomBytes(20);
  let result = '';
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += ALPHABET[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  return result;
}

export function decodeMfaSecret(secret: string): Buffer | null {
  if (!/^[A-Z2-7]{32}$/.test(secret)) return null;
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;
  for (const character of secret) {
    value = (value << 5) | ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
    value &= (1 << bits) - 1;
  }
  return bytes.length === 20 ? Buffer.from(bytes) : null;
}

function keyFromEnvironment(): Buffer | null {
  const raw = process.env.SITE_MAPPER_MFA_KEY?.trim();
  if (!raw) return null;
  if (/^[a-fA-F0-9]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  return decoded.length === 32 ? decoded : null;
}

export function mfaKeyAvailable(): boolean {
  return keyFromEnvironment() !== null;
}

export function encryptMfaSecret(userId: string, secret: string): string | null {
  const key = keyFromEnvironment();
  if (!key || !decodeMfaSecret(secret)) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('appm-mfa:' + userId));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

export function decryptMfaSecret(userId: string, sealed: string): string | null {
  const key = keyFromEnvironment();
  if (!key) return null;
  const parts = sealed.split('.');
  if (parts.length !== 3) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0]!, 'base64url'));
    decipher.setAAD(Buffer.from('appm-mfa:' + userId));
    decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'));
    const secret = Buffer.concat([
      decipher.update(Buffer.from(parts[1]!, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return decodeMfaSecret(secret) ? secret : null;
  } catch {
    return null;
  }
}

export function matchTotpStep(secret: string, code: string, nowMs = Date.now()): number | null {
  if (!/^[0-9]{6}$/.test(code) || !Number.isFinite(nowMs)) return null;
  const key = decodeMfaSecret(secret);
  if (!key) return null;
  const current = Math.floor(nowMs / 30_000);
  for (const delta of [-1, 0, 1]) {
    const step = current + delta;
    if (step < 0) continue;
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac('sha1', key).update(counter).digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const calculated = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    const expected = Buffer.from(String(calculated).padStart(6, '0'));
    if (timingSafeEqual(Buffer.from(code), expected)) return step;
  }
  return null;
}

export function provisioningUri(email: string, secret: string): string {
  const label = encodeURIComponent('Site Mapper:' + email);
  return (
    'otpauth://totp/' +
    label +
    '?secret=' +
    secret +
    '&issuer=Site%20Mapper&algorithm=SHA1&digits=6&period=30'
  );
}

/** Eight 128-bit single-use codes. Only their hashes are stored server-side. */
export function createMfaRecoveryCodes(): readonly string[] {
  return Array.from({ length: 8 }, () => {
    const value = randomBytes(16).toString('hex').toUpperCase();
    return value.match(/.{1,8}/g)!.join('-');
  });
}

export function hashMfaRecoveryCode(userId: string, code: string): string | null {
  const clean = code.replaceAll('-', '').trim().toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(clean)) return null;
  return createHash('sha256')
    .update('mfa-recovery:' + userId + ':' + clean)
    .digest('hex');
}
