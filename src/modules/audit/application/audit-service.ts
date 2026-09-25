import type { AuditRepository } from '@/modules/audit/application/audit-repository';
import type {
  AuditAction,
  AuditActor,
  AuditEvent,
  AuditMetadataValue,
  AuditTarget,
} from '@/modules/audit/domain/entities';
import { createDomainId, nowIso } from '@/shared/domain/entity';

const SENSITIVE_KEY = /(password|token|secret|hash|cookie|authorization)/i;
const METADATA_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_METADATA_KEYS = 16;
const MAX_STRING_VALUE_LENGTH = 256;

export interface RecordAuditInput {
  readonly actor: AuditActor;
  readonly action: AuditAction;
  readonly target?: AuditTarget;
  readonly metadata?: Readonly<Record<string, AuditMetadataValue>>;
}

function validateMetadata(
  metadata: Readonly<Record<string, AuditMetadataValue>>,
): Readonly<Record<string, AuditMetadataValue>> {
  const entries = Object.entries(metadata);

  if (entries.length > MAX_METADATA_KEYS) {
    throw new Error('Audit metadata contains too many keys.');
  }

  for (const [key, value] of entries) {
    if (!METADATA_KEY.test(key) || SENSITIVE_KEY.test(key)) {
      throw new Error('Audit metadata contains a prohibited key.');
    }

    if (typeof value === 'string' && value.length > MAX_STRING_VALUE_LENGTH) {
      throw new Error('Audit metadata string value is too long.');
    }

    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Audit metadata number must be finite.');
    }
  }

  return Object.fromEntries(entries);
}

export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    private readonly clock: () => string = nowIso,
  ) {}

  async record(input: RecordAuditInput): Promise<AuditEvent> {
    if (input.actor.type === 'USER' && !input.actor.userId.trim()) {
      throw new Error('Audit actor userId is required.');
    }

    if (input.target && !input.target.id.trim()) {
      throw new Error('Audit target id is required.');
    }

    const event: AuditEvent = {
      id: createDomainId(),
      occurredAt: this.clock(),
      actor: input.actor,
      action: input.action,
      ...(input.target === undefined ? {} : { target: input.target }),
      outcome: 'SUCCEEDED',
      metadata: validateMetadata(input.metadata ?? {}),
    };

    await this.repository.append(event);
    return event;
  }
}
