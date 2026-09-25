export type AuditAction =
  | 'AUTH.SESSION_REVOKED'
  | 'IDENTITY.PASSWORD_CHANGED'
  | 'IDENTITY.PROFILE_UPDATED'
  | 'IDENTITY.SUPERADMIN_BOOTSTRAPPED'
  | 'IDENTITY.USER_CREATED'
  | 'IDENTITY.USER_UPDATED';

export type AuditOutcome = 'SUCCEEDED';

export type AuditActor = Readonly<{ type: 'SYSTEM' }> | Readonly<{ type: 'USER'; userId: string }>;

export interface AuditTarget {
  readonly kind: 'USER';
  readonly id: string;
}

export type AuditMetadataValue = string | number | boolean | null;

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly actor: AuditActor;
  readonly action: AuditAction;
  readonly target?: AuditTarget;
  readonly outcome: AuditOutcome;
  readonly metadata: Readonly<Record<string, AuditMetadataValue>>;
}
