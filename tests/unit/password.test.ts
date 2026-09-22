import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '@/modules/identity/domain/password';

describe('password hashing', () => {
  it('stores only a scrypt representation and verifies the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password value', hash)).resolves.toBe(false);
  });

  it('rejects short passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 12');
  });
});
