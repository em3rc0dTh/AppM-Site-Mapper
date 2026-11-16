import { createHash } from 'node:crypto';
import { scrypt } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { assessNewPassword } from '@/modules/identity/application/password-policy';

import { hashPassword, verifyPassword } from '@/modules/identity/domain/password';

describe('password hashing', () => {
  it('stores only a scrypt representation and verifies the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^scrypt\$16384\$8\$5\$/);
    expect(hash).not.toContain('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password value', hash)).resolves.toBe(false);
  });

  it('verifies legacy scrypt p=1 hashes without downgrading new hashes', async () => {
    const password = 'legacy customer credential 2026';
    const salt = Buffer.alloc(16, 0x11);
    const key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      });
    });
    const legacyHash = [
      'scrypt',
      '16384',
      '8',
      '1',
      salt.toString('base64url'),
      key.toString('base64url'),
    ].join('
    await expect(hashPassword('short')).rejects.toThrow('at least 12');
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
);
    await expect(verifyPassword(password, legacyHash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', legacyHash)).resolves.toBe(false);
  });

  it('rejects short passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 12');
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
