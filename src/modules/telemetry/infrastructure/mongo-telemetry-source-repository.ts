import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { TelemetrySourceRepository } from '@/modules/telemetry/application/telemetry-source-repository';
import type { TelemetrySource } from '@/modules/telemetry/domain/entities';

type TelemetrySourceDocument = TelemetrySource & Document;

function toDomain(document: TelemetrySourceDocument): TelemetrySource {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;

  if (
    typeof copy.id !== 'string' ||
    typeof copy.entityId !== 'string' ||
    (copy.entityKind !== 'DEVICE' && copy.entityKind !== 'EQUIPMENT') ||
    typeof copy.topicSource !== 'string' ||
    typeof copy.expectedSerialNumber !== 'string' ||
    typeof copy.protocolProfile !== 'string' ||
    typeof copy.rawSchemaVersion !== 'string' ||
    typeof copy.staleAfterSeconds !== 'number' ||
    typeof copy.enabled !== 'boolean'
  ) {
    throw new Error('Invalid telemetry source document.');
  }

  return copy as unknown as TelemetrySource;
}

export class MongoTelemetrySourceRepository implements TelemetrySourceRepository {
  private readonly collection: Collection<TelemetrySourceDocument>;

  constructor(database: Db) {
    this.collection = database.collection<TelemetrySourceDocument>('telemetry_sources');
  }

  async findByTopicSource(topicSource: string): Promise<TelemetrySource | null> {
    const document = await this.collection.findOne({ topicSource });
    return document ? toDomain(document) : null;
  }

  async list(): Promise<readonly TelemetrySource[]> {
    const documents = await this.collection.find({}).sort({ id: 1 }).toArray();
    return documents.map(toDomain);
  }

  async insert(source: TelemetrySource): Promise<void> {
    await this.collection.insertOne(source as OptionalUnlessRequiredId<TelemetrySourceDocument>);
  }
}
