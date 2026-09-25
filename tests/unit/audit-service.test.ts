import { describe, expect, it } from 'vitest';

import { AuditService } from '@/modules/audit/application/audit-service';
import { MemoryAuditRepository } from '@/modules/audit/infrastructure/memory-audit-repository';

describe('AuditService', () => {
  it('persists a bounded append-only administrative event', async () => {
    const repository = new MemoryAuditRepository();
    const service = new AuditService(repository, () => '2026-09-24T12:00:00.000Z');

    const event = await service.record({
      actor: { type: 'USER', userId: 'actor-1' },
      action: 'IDENTITY.USER_UPDATED',
      target: { kind: 'USER', id: 'target-1' },
      metadata: {
        role: 'ADMIN',
        lifecycle: 'ACTIVE',
        displayNameChanged: true,
      },
    });

    expect(event).toMatchObject({
      occurredAt: '2026-09-24T12:00:00.000Z',
      actor: { type: 'USER', userId: 'actor-1' },
      action: 'IDENTITY.USER_UPDATED',
      target: { kind: 'USER', id: 'target-1' },
      outcome: 'SUCCEEDED',
    });
    await expect(repository.listRecent(10)).resolves.toEqual([event]);
  });

  it.each([
    'password',
    'passwordHash',
    'sessionToken',
    'api_secret',
    'cookie',
    'authorizationHeader',
  ])('rejects sensitive metadata key %s', async (key) => {
    const repository = new MemoryAuditRepository();
    const service = new AuditService(repository);

    await expect(
      service.record({
        actor: { type: 'SYSTEM' },
        action: 'IDENTITY.SUPERADMIN_BOOTSTRAPPED',
        metadata: { [key]: 'must-not-persist' },
      }),
    ).rejects.toThrow('Audit metadata contains a prohibited key.');

    await expect(repository.listRecent(10)).resolves.toHaveLength(0);
  });

  it('rejects unbounded metadata values', async () => {
    const repository = new MemoryAuditRepository();
    const service = new AuditService(repository);

    await expect(
      service.record({
        actor: { type: 'SYSTEM' },
        action: 'IDENTITY.SUPERADMIN_BOOTSTRAPPED',
        metadata: { note: 'x'.repeat(257) },
      }),
    ).rejects.toThrow('Audit metadata string value is too long.');
  });
});
