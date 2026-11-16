import { createHash, scrypt } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { assessNewPassword } from '@/modules/identity/application/password-policy';
import { hashPassword, verifyPassword } from '@/modules/identity/domain/password';

describe('password hashing', () => {
  it('stores scrypt N=16384 r=8 p=5 and verifies the correct password', async () => {
    const password = 'correct horse battery staple';
    const hash = await hashPassword(password);

    expect(hash.split('$').slice(0, 4)).toEqual(['scrypt', '16384', '8', '5']);
    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password value', hash)).resolves.toBe(false);
  });

  it('verifies a legacy scrypt N=16384 r=8 p=1 credential without downgrade', async () => {
    const password = 'legacy customer credential 2026';
    const salt = Buffer.alloc(16, 0x11);
    const legacyKey = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      });
    });
    const oldHash = [
      'scrypt',
      '16384',
      '8',
      '1',
      salt.toString('base64url'),
      legacyKey.toString('base64url'),
    ].join('$');
    await expect(verifyPassword(password, oldHash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', oldHash)).resolves.toBe(false);
  });

  it('rejects short passwords and oversized new credentials', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 12');
    await expect(hashPassword('x'.repeat(1025))).rejects.toThrow('maximum length');
  });
});

describe('new-password policy', () => {
  it('rejects common secrets and excessively large secrets without remote access', async () => {
    await expect(assessNewPassword('password123456')).resolves.toBe('PASSWORD_COMPROMISED');
    await expect(assessNewPassword('safe but short')).resolves.toBe('ACCEPTED');
    await expect(assessNewPassword('x'.repeat(1025))).resolves.toBe('INVALID_INPUT');
  });

  it('detects a breached password via k-anonymity without exposing plaintext', async () => {
    const password = 'Unique-vault-test-2026';
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const lookup = async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://api.pwnedpasswords.com/range/' + sha1.slice(0, 5));
      expect(String(url)).not.toContain(password);
      return new Response(sha1.slice(5) + ':42\n', { status: 200 });
    };
    await expect(assessNewPassword(password, 'online', lookup as typeof fetch)).resolves.toBe(
      'PASSWORD_COMPROMISED',
    );
  });

  it('fails closed when external breach screening is unavailable', async () => {
    const unavailable = async () => {
      throw new Error('offline');
    };
    await expect(
      assessNewPassword('Unique-vault-test-2026', 'online', unavailable as typeof fetch),
    ).resolves.toBe('PASSWORD_CHECK_UNAVAILABLE');
  });
});
