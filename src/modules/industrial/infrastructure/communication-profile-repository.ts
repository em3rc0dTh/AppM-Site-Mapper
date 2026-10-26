import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { CommunicationProfile } from '@/modules/industrial/domain/commissioning';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface CommunicationProfileRepository {
  get(equipmentId: string): Promise<CommunicationProfile | null>;
  listByBdfb(bdfbDeviceId: string): Promise<readonly CommunicationProfile[]>;
  listAll(): Promise<readonly CommunicationProfile[]>;
  /** Compare-and-swap. The caller must not silently overwrite a concurrent revision. */
  save(next: CommunicationProfile, expectedRevision: number | null): Promise<boolean>;
}

class MemoryCommunicationProfiles implements CommunicationProfileRepository {
  private readonly profiles = new Map<string, CommunicationProfile>();

  async get(id: string) {
    const record = this.profiles.get(id);
    return record ? structuredClone(record) : null;
  }

  async listByBdfb(id: string) {
    return [...this.profiles.values()]
      .filter((profile) => profile.bdfbDeviceId === id)
      .map((profile) => structuredClone(profile));
  }

  async listAll() {
    return [...this.profiles.values()].map((profile) => structuredClone(profile));
  }

  async save(next: CommunicationProfile, expected: number | null) {
    const previous = this.profiles.get(next.equipmentId);
    if ((previous?.revisionNumber ?? null) !== expected) return false;
    if (
      next.role === 'GATEWAY' &&
      next.sourceIdentity &&
      [...this.profiles.values()].some(
        (item) =>
          item.equipmentId !== next.equipmentId &&
          item.role === 'GATEWAY' &&
          item.sourceIdentity === next.sourceIdentity,
      )
    )
      return false;
    if (
      next.role === 'METER' &&
      [...this.profiles.values()].some(
        (item) =>
          item.equipmentId !== next.equipmentId &&
          item.role === 'METER' &&
          item.gatewayEquipmentId === next.gatewayEquipmentId &&
          item.rs485.slaveId === next.rs485.slaveId,
      )
    )
      return false;
    this.profiles.set(next.equipmentId, structuredClone(next));
    return true;
  }
}

class MongoCommunicationProfiles implements CommunicationProfileRepository {
  private readonly records: Collection<CommunicationProfile & Document>;

  constructor(db: Db) {
    this.records = db.collection<CommunicationProfile & Document>(
      'industrial_communication_profiles',
    );
  }

  private toDomain(doc: (CommunicationProfile & Document) | null): CommunicationProfile | null {
    if (!doc) return null;
    const value = { ...doc } as Record<string, unknown>;
    delete value._id;
    return value as unknown as CommunicationProfile;
  }

  async get(equipmentId: string): Promise<CommunicationProfile | null> {
    return this.toDomain(await this.records.findOne({ equipmentId }));
  }

  async listByBdfb(bdfbDeviceId: string): Promise<readonly CommunicationProfile[]> {
    const documents = await this.records.find({ bdfbDeviceId }).sort({ equipmentId: 1 }).toArray();
    return documents.map((document) => this.toDomain(document)!);
  }

  async listAll(): Promise<readonly CommunicationProfile[]> {
    const documents = await this.records.find({}).sort({ equipmentId: 1 }).toArray();
    return documents.map((document) => this.toDomain(document)!);
  }

  async save(next: CommunicationProfile, expected: number | null): Promise<boolean> {
    if (expected === null) {
      try {
        await this.records.insertOne(
          next as OptionalUnlessRequiredId<CommunicationProfile & Document>,
        );
        return true;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
          return false;
        throw error;
      }
    }
    try {
      const result = await this.records.replaceOne(
        { equipmentId: next.equipmentId, revisionNumber: expected },
        next,
      );
      return result.matchedCount === 1;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
        return false;
      throw error;
    }
  }
}

export async function createCommunicationProfileRepository(): Promise<CommunicationProfileRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<CommunicationProfileRepository>(
      'industrial-communication-profiles',
      () => new MemoryCommunicationProfiles(),
    );
  }
  return new MongoCommunicationProfiles(await getMongoDatabase());
}
