export interface IndustrialCredentialRecord {
  readonly equipmentId: string;
  readonly algorithm: 'AES-256-GCM';
  readonly keyVersion: 1;
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly revisionNumber: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly lastRevealedAt?: string;
  readonly lastRevealedBy?: string;
}

export interface IndustrialCredentialMetadata {
  readonly equipmentId: string;
  readonly hasCredential: boolean;
  readonly revisionNumber?: number;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
  readonly lastRevealedAt?: string;
  readonly lastRevealedBy?: string;
}
