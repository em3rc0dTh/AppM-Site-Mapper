import type { AuthThrottle, IdentityRepository } from './identity-repository';
import { AuthService } from './auth-service';
import { verifyPassword } from '@/modules/identity/domain/password';
import {
  createMfaSecret,
  decryptMfaSecret,
  encryptMfaSecret,
  matchTotpStep,
  mfaKeyAvailable,
  provisioningUri,
} from './mfa-totp';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type MfaError =
  | 'SESSION_INVALID'
  | 'PASSWORD_INVALID'
  | 'MFA_KEY_NOT_CONFIGURED'
  | 'MFA_ALREADY_ENABLED'
  | 'MFA_NOT_ENABLED'
  | 'MFA_DISABLE_FORBIDDEN'
  | 'MFA_PENDING_EXPIRED'
  | 'MFA_CODE_INVALID'
  | 'RATE_LIMITED';

export class MfaService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly throttle: AuthThrottle,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async account(token: string) {
    const session = await new AuthService(
      this.repository,
      this.throttle,
      this.clock,
    ).resolveSession(token);
    if (!session || session.mustChangePassword) return null;
    return this.repository.getUserById(session.id);
  }

  async status(
    token: string,
  ): Promise<Result<{ enabled: boolean; pending: boolean; available: boolean }, MfaError>> {
    const user = await this.account(token);
    if (!user) return failure('SESSION_INVALID');
    return success({
      enabled: Boolean(user.mfaSecretCiphertext),
      pending: Boolean(user.mfaPendingSecretCiphertext),
      available: mfaKeyAvailable(),
    });
  }

  async start(
    token: string,
    password: string,
  ): Promise<Result<{ secret: string; uri: string }, MfaError>> {
    const user = await this.account(token);
    if (!user) return failure('SESSION_INVALID');
    if (user.mfaSecretCiphertext) return failure('MFA_ALREADY_ENABLED');
    if (!mfaKeyAvailable()) return failure('MFA_KEY_NOT_CONFIGURED');
    if (!(await this.throttle.consume('mfa-enroll:' + user.id, this.clock(), 5, 15 * 60_000)))
      return failure('RATE_LIMITED');
    if (!(await verifyPassword(password, user.passwordHash))) return failure('PASSWORD_INVALID');

    const secret = createMfaSecret();
    const encrypted = encryptMfaSecret(user.id, secret);
    if (!encrypted) return failure('MFA_KEY_NOT_CONFIGURED');
    await this.repository.replaceUser(
      {
        ...user,
        mfaPendingSecretCiphertext: encrypted,
        mfaPendingStartedAt: this.clock().toISOString(),
        updatedAt: nowIso(),
      },
      user,
      user.id,
    );
    return success({ secret, uri: provisioningUri(user.email, secret) });
  }

  async confirm(
    token: string,
    code: string,
  ): Promise<Result<{ reauthenticationRequired: true }, MfaError>> {
    const user = await this.account(token);
    if (!user) return failure('SESSION_INVALID');
    if (user.mfaSecretCiphertext) return failure('MFA_ALREADY_ENABLED');
    const now = this.clock();
    const startedAt = Date.parse(user.mfaPendingStartedAt ?? '');
    if (
      !user.mfaPendingSecretCiphertext ||
      !Number.isFinite(startedAt) ||
      now.getTime() - startedAt > 10 * 60_000 ||
      startedAt > now.getTime()
    )
      return failure('MFA_PENDING_EXPIRED');
    if (!(await this.throttle.consume('mfa-confirm:' + user.id, now, 10, 15 * 60_000)))
      return failure('RATE_LIMITED');
    const secret = decryptMfaSecret(user.id, user.mfaPendingSecretCiphertext);
    if (!secret) return failure('MFA_KEY_NOT_CONFIGURED');
    if (matchTotpStep(secret, code, now.getTime()) === null) return failure('MFA_CODE_INVALID');

    const { mfaPendingSecretCiphertext, mfaPendingStartedAt, ...rest } = user;
    void mfaPendingStartedAt;
    await this.repository.replaceUser(
      { ...rest, mfaSecretCiphertext: mfaPendingSecretCiphertext, updatedAt: nowIso() },
      user,
      user.id,
    );
    await this.repository.revokeUserSessions(user.id, now);
    return success({ reauthenticationRequired: true });
  }

  async disable(
    token: string,
    password: string,
    code: string,
  ): Promise<Result<{ reauthenticationRequired: true }, MfaError>> {
    if (process.env.SITE_MAPPER_MFA_REQUIRED === 'true') return failure('MFA_DISABLE_FORBIDDEN');
    const user = await this.account(token);
    if (!user) return failure('SESSION_INVALID');
    if (!user.mfaSecretCiphertext) return failure('MFA_NOT_ENABLED');
    const now = this.clock();
    if (!(await this.throttle.consume('mfa-disable:' + user.id, now, 5, 15 * 60_000)))
      return failure('RATE_LIMITED');
    if (!(await verifyPassword(password, user.passwordHash))) return failure('PASSWORD_INVALID');
    const secret = decryptMfaSecret(user.id, user.mfaSecretCiphertext);
    if (!secret) return failure('MFA_KEY_NOT_CONFIGURED');
    const step = matchTotpStep(secret, code, now.getTime());
    if (
      step === null ||
      !(await this.repository.consumeMfaStep(user.id, user.mfaSecretCiphertext, step))
    )
      return failure('MFA_CODE_INVALID');

    const { mfaSecretCiphertext, mfaLastUsedStep, ...rest } = user;
    void mfaSecretCiphertext;
    void mfaLastUsedStep;
    await this.repository.replaceUser({ ...rest, updatedAt: nowIso() }, user, user.id);
    await this.repository.revokeUserSessions(user.id, now);
    return success({ reauthenticationRequired: true });
  }
}
