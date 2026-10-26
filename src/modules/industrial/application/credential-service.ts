import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

import type {
  IndustrialCredentialEvent,
  IndustrialCredentialMetadata,
  IndustrialCredentialRecord,
} from '@/modules/industrial/domain/credential';
import type { IndustrialCredentialRepository } from '@/modules/industrial/infrastructure/credential-repository';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';

type CredentialError =
  | 'EQUIPMENT_NOT_FOUND'
  | 'CREDENTIAL_NOT_FOUND'
  | 'CREDENTIAL_KEY_NOT_CONFIGURED'
  | 'INVALID_PASSWORD'
  | 'CREDENTIAL_CONFLICT'
  | 'CREDENTIAL_DECRYPT_FAILED';

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: CredentialError };

const good = <T>(value: T): Result<T> => ({ ok: true, value });
const bad = <T = never>(error: CredentialError): Result<T> => ({ ok: false, error });

function keyFromEnvironment(): Buffer | null {
  const raw = process.env.SITE_MAPPER_CREDENTIAL_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const decoded = Buffer.from(raw, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

function encrypt(equipmentId: string, password: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(equipmentId, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decrypt(record: IndustrialCredentialRecord, key: Buffer): string | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
    decipher.setAAD(Buffer.from(record.equipmentId, 'utf8'));
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

function auditEvent(
  equipmentId: string,
  type: IndustrialCredentialEvent['type'],
  actorId: string,
  occurredAt: string,
  credentialRevision?: number,
): IndustrialCredentialEvent {
  return {
    id: randomUUID(),
    equipmentId,
    type,
    actorId,
    occurredAt,
    ...(credentialRevision !== undefined ? { credentialRevision } : {}),
  };
}

function metadata(
  record: IndustrialCredentialRecord | null,
  equipmentId: string,
  recentEvents: readonly IndustrialCredentialEvent[],
): IndustrialCredentialMetadata {
  const lastReveal = recentEvents.find((event) => event.type === 'REVEALED');
  return {
    equipmentId,
    hasCredential: Boolean(record),
    ...(record
      ? {
          revisionNumber: record.revisionNumber,
          updatedAt: record.updatedAt,
          updatedBy: record.updatedBy,
        }
      : {}),
    ...(lastReveal
      ? {
          lastRevealedAt: lastReveal.occurredAt,
          lastRevealedBy: lastReveal.actorId,
        }
      : {}),
    recentEvents,
  };
}

export class IndustrialCredentialService {
  constructor(
    private readonly repository: IndustrialCredentialRepository,
    private readonly topology: TopologyRepository,
  ) {}

  private async activeEquipment(equipmentId: string): Promise<boolean> {
    const equipment = await this.topology.getById(equipmentId);
    return Boolean(equipment && equipment.kind === 'EQUIPMENT' && equipment.lifecycle === 'ACTIVE');
  }

  async getMetadata(equipmentId: string): Promise<Result<IndustrialCredentialMetadata>> {
    if (!(await this.activeEquipment(equipmentId))) return bad('EQUIPMENT_NOT_FOUND');
    const [record, events] = await Promise.all([
      this.repository.get(equipmentId),
      this.repository.listEvents(equipmentId),
    ]);
    return good(metadata(record, equipmentId, events));
  }

  async setPassword(
    equipmentId: string,
    password: string,
    actorId: string,
  ): Promise<Result<IndustrialCredentialMetadata>> {
    if (!(await this.activeEquipment(equipmentId))) return bad('EQUIPMENT_NOT_FOUND');
    if (!password || password.length > 512) return bad('INVALID_PASSWORD');
    const key = keyFromEnvironment();
    if (!key) return bad('CREDENTIAL_KEY_NOT_CONFIGURED');

    const previous = await this.repository.get(equipmentId);
    const now = new Date().toISOString();
    const encrypted = encrypt(equipmentId, password, key);
    const next: IndustrialCredentialRecord = {
      equipmentId,
      algorithm: 'AES-256-GCM',
      keyVersion: 1,
      ...encrypted,
      revisionNumber: (previous?.revisionNumber ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      createdBy: previous?.createdBy ?? actorId,
      updatedAt: now,
      updatedBy: actorId,
    };
    const event = auditEvent(
      equipmentId,
      previous ? 'ROTATED' : 'CREATED',
      actorId,
      now,
      next.revisionNumber,
    );
    if (!(await this.repository.saveWithEvent(next, previous?.revisionNumber ?? null, event)))
      return bad('CREDENTIAL_CONFLICT');
    return good(metadata(next, equipmentId, await this.repository.listEvents(equipmentId)));
  }

  async revealPassword(
    equipmentId: string,
    actorId: string,
  ): Promise<
    Result<{ readonly password: string; readonly metadata: IndustrialCredentialMetadata }>
  > {
    if (!(await this.activeEquipment(equipmentId))) return bad('EQUIPMENT_NOT_FOUND');
    const key = keyFromEnvironment();
    if (!key) return bad('CREDENTIAL_KEY_NOT_CONFIGURED');

    const current = await this.repository.get(equipmentId);
    if (!current) return bad('CREDENTIAL_NOT_FOUND');
    const password = decrypt(current, key);
    if (password === null) return bad('CREDENTIAL_DECRYPT_FAILED');

    const now = new Date().toISOString();
    await this.repository.appendEvent(
      auditEvent(equipmentId, 'REVEALED', actorId, now, current.revisionNumber),
    );
    const events = await this.repository.listEvents(equipmentId);
    return good({ password, metadata: metadata(current, equipmentId, events) });
  }

  async removePassword(
    equipmentId: string,
    actorId: string,
  ): Promise<Result<IndustrialCredentialMetadata>> {
    if (!(await this.activeEquipment(equipmentId))) return bad('EQUIPMENT_NOT_FOUND');
    const current = await this.repository.get(equipmentId);
    if (!current) {
      return good(metadata(null, equipmentId, await this.repository.listEvents(equipmentId)));
    }
    const now = new Date().toISOString();
    const event = auditEvent(equipmentId, 'DELETED', actorId, now, current.revisionNumber);
    if (!(await this.repository.removeWithEvent(equipmentId, current.revisionNumber, event)))
      return bad('CREDENTIAL_CONFLICT');
    return good(metadata(null, equipmentId, await this.repository.listEvents(equipmentId)));
  }
}
