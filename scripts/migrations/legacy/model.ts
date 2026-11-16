export type LegacyRecord = Readonly<Record<string, unknown>>;

export interface LegacyMigrationInput {
  readonly network: Readonly<{
    id: string;
    name: string;
  }>;
  readonly collections: Readonly<Record<string, readonly LegacyRecord[]>>;
  /**
   * Optional evidence-backed MQTT bindings for embedded legacy BDFB panels.
   * Keyed by legacy Device ID, then exact panel label. Values are raw-point
   * prefixes such as "0_1_". An explicit migration binding wins over a legacy panel.telemetryPrefix.
   */
  readonly bfdbPanelTelemetryPrefixes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly idMap?: Readonly<Record<string, string>>;
}

export type CanonicalKind =
  | 'NETWORK'
  | 'SITE'
  | 'STRUCTURE'
  | 'LEVEL'
  | 'ROOM_SUBSTRUCTURE'
  | 'CONTAINER_CLUSTER_BAY'
  | 'POSITION'
  | 'CONTAINER_RACK'
  | 'DEVICE'
  | 'EQUIPMENT';

export interface CanonicalNode {
  readonly id: string;
  readonly legacyId?: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly kind: CanonicalKind;
  readonly lifecycle: 'ACTIVE' | 'ARCHIVED';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
}

export interface MigrationRejection {
  readonly sourceCollection: string;
  readonly legacyId?: string;
  readonly reason: string;
}

export interface MigrationWarning {
  readonly sourceCollection: string;
  readonly legacyId?: string;
  readonly message: string;
}

export interface MigrationPlan {
  readonly sourceFingerprint: string;
  readonly nodes: readonly CanonicalNode[];
  readonly idMap: Readonly<Record<string, string>>;
  readonly warnings: readonly MigrationWarning[];
  readonly rejections: readonly MigrationRejection[];
  readonly counts: Readonly<{
    source: number;
    transformed: number;
    rejected: number;
  }>;
}

export function migrationKey(kind: CanonicalKind, legacyId: string): string {
  return `${kind}:${legacyId}`;
}
