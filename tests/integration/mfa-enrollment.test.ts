import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { AuthService } from '@/modules/identity/application/auth-service';
import { MfaService } from '@/modules/identity/application/mfa-service';
import {
  createMfaSecret,
  decodeMfaSecret,
  decryptMfaSecret,
  encryptMfaSecret,
  matchTotpStep,
} from '@/modules/identity/application/mfa-totp';
import {
  MemoryAuthThrottle,
  MemoryIdentityRepository,
} from '@/modules/identity/infrastructure/memory-identity-repository';

const previousKey = process.env.SITE_MAPPER_MFA_KEY;
const previousRequired = process.env.SITE_MAPPER_MFA_REQUIRED;

afterEach(() => {
  if (previousKey === undefined) delete process.env.SITE_MAPPER_MFA_KEY;
  else process.env.SITE_MAPPER_MFA_KEY = previousKey;
  if (previousRequired === undefined) delete process.env.SITE_MAPPER_MFA_REQUIRED;
  else process.env.SITE_MAPPER_MFA_REQUIRED = previousRequired;
});

function codeFor(secret: string, date: Date): string {
  const step = Math.floor(date.getTime() / 30_000);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeMfaSecret(secret)!).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

describe('Site Mapper TOTP MFA', () => {
  it('matches the RFC 6238 SHA-1 six-digit truncation reference', () => {
    const reference = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(matchTotpStep(reference, '287082', 59_000)).toBe(1);
    expect(matchTotpStep(reference, '287083', 59_000)).toBeNull();
  });

  it('encrypts account-bound secrets without exposing plaintext', () => {
    process.env.SITE_MAPPER_MFA_KEY = 'ac'.repeat(32);
    const secret = createMfaSecret();
    expect(decodeMfaSecret(secret)).toHaveLength(20);
    const encrypted = encryptMfaSecret('user-1', secret)!;
    expect(encrypted).not.toContain(secret);
    expect(decryptMfaSecret('user-1', encrypted)).toBe(secret);
    expect(decryptMfaSecret('user-2', encrypted)).toBeNull();
  });

  it('enrolls and demands one-time TOTP for future logins', async () => {
    process.env.SITE_MAPPER_MFA_KEY = 'ac'.repeat(32);
    process.env.SITE_MAPPER_MFA_REQUIRED = 'false';
    let now = new Date('2026-11-16T08:00:00.000Z');
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    const auth = new AuthService(repository, throttle, () => now);
    const mfa = new MfaService(repository, throttle, () => now);
    await auth.bootstrapSuperadmin('admin@example.com', 'a strong initial password', 'Admin');

    const first = await auth.authenticate(
      'admin@example.com',
      'a strong initial password',
      'mfa-1',
    );
    if (!first.ok) throw new Error('expected initial login');

    const started = await mfa.start(first.value.token, 'a strong initial password');
    if (!started.ok) throw new Error('expected enrollment');
    const code = codeFor(started.value.secret, now);
    const confirmation = await mfa.confirm(first.value.token, code);
    expect(confirmation.ok).toBe(true);
    if (!confirmation.ok) throw new Error('expected backup codes');
    expect(confirmation.value.recoveryCodes).toHaveLength(8);
    expect(await auth.resolveSession(first.value.token)).toBeNull();

    expect(
      await auth.authenticate('admin@example.com', 'a strong initial password', 'mfa-2'),
    ).toEqual({
      ok: false,
      error: 'MFA_REQUIRED',
    });
    const valid = await auth.authenticate(
      'admin@example.com',
      'a strong initial password',
      'mfa-3',
      code,
    );
    expect(valid.ok).toBe(true);
    expect(
      await auth.authenticate('admin@example.com', 'a strong initial password', 'mfa-4', code),
    ).toEqual({
      ok: false,
      error: 'MFA_INVALID',
    });

    if (!valid.ok) throw new Error('expected TOTP login');
    now = new Date('2026-11-16T08:00:31.000Z');
    const next = codeFor(started.value.secret, now);
    expect((await mfa.disable(valid.value.token, 'a strong initial password', next)).ok).toBe(true);
    expect(await auth.resolveSession(valid.value.token)).toBeNull();
    expect(
      (await auth.authenticate('admin@example.com', 'a strong initial password', 'mfa-5')).ok,
    ).toBe(true);
  });

  it('accepts one-time recovery codes and rejects reuse after consumption', async () => {
    process.env.SITE_MAPPER_MFA_KEY = 'ab'.repeat(32);
    process.env.SITE_MAPPER_MFA_REQUIRED = 'false';
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    const auth = new AuthService(repository, throttle);
    const mfa = new MfaService(repository, throttle);
    await auth.bootstrapSuperadmin('admin@example.com', 'a strong initial password', 'Admin');
    const first = await auth.authenticate('admin@example.com', 'a strong initial password', 'recovery-a');
    if (!first.ok) throw new Error('expected login');
    const started = await mfa.start(first.value.token, 'a strong initial password');
    if (!started.ok) throw new Error('expected enrollment');
    const confirmation = await mfa.confirm(
      first.value.token,
      codeFor(started.value.secret, new Date()),
    );
    if (!confirmation.ok) throw new Error('expected codes');
    const recovery = confirmation.value.recoveryCodes[0]!;
    const signedIn = await auth.authenticate(
      'admin@example.com',
      'a strong initial password',
      'recovery-b',
      recovery,
    );
    expect(signedIn.ok).toBe(true);
    expect(
      await auth.authenticate('admin@example.com', 'a strong initial password', 'recovery-c', recovery),
    ).toEqual({ ok: false, error: 'MFA_INVALID' });
  });

  it('fails closed when a mandatory-MFA account has not enrolled', async () => {
    process.env.SITE_MAPPER_MFA_REQUIRED = 'true';
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    const auth = new AuthService(repository, throttle);
    await auth.bootstrapSuperadmin('admin@example.com', 'a strong initial password', 'Admin');
    expect(
      await auth.authenticate('admin@example.com', 'a strong initial password', 'mfa-gate'),
    ).toEqual({
      ok: false,
      error: 'MFA_ENROLLMENT_REQUIRED',
    });
  });
});
