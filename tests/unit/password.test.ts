import { describe, expect, it } from 'vitest';

import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  verifyPassword,
} from '@/modules/identity/domain/password';

describe('password hashing', () => {
  it('stores only a scrypt representation and verifies the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password value', hash)).resolves.toBe(false);
  });

  it('rejects short passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow('between 12 and 256');
  });

  it('rejects oversized passwords before running scrypt', async () => {
    const oversized = 'x'.repeat(MAX_PASSWORD_LENGTH + 1);
    const hash = await hashPassword('correct horse battery staple');

    await expect(hashPassword(oversized)).rejects.toThrow('between 12 and 256');
    await expect(verifyPassword(oversized, hash)).resolves.toBe(false);
  });
});
