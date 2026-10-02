import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';

type BindingDocument = TelemetryBinding & Document;

function toDomain(document: BindingDocument): TelemetryBinding {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as unknown as TelemetryBinding;
}

export class MongoTelemetryBindingRepository implements TelemetryBindingRepository {
  private readonly collection: Collection<BindingDocument>;

  constructor(database: Db) {
    this.collection = database.collection<BindingDocument>('telemetry_bindings');
  }

  async listForSource(
    protocol: TelemetryBinding['protocol'],
    sourceIdentity: string,
  ): Promise<readonly TelemetryBinding[]> {
    const documents = await this.collection
      .find({ lifecycle: 'ACTIVE', protocol, sourceIdentity })
      .sort({ sourcePointId: 1 })
      .toArray();
    return documents.map(toDomain);
  }

  async insert(binding: TelemetryBinding): Promise<void> {
    await this.collection.insertOne(binding as OptionalUnlessRequiredId<BindingDocument>);
  }

  async replace(binding: TelemetryBinding): Promise<void> {
    const result = await this.collection.replaceOne(
      { id: binding.id },
      binding as OptionalUnlessRequiredId<BindingDocument>,
    );
    if (result.matchedCount !== 1) throw new Error('TelemetryBinding does not exist: ' + binding.id);
  }
}
