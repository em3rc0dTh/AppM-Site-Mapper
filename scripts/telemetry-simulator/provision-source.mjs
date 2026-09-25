import { loadEnvFile } from 'node:process';

import { MongoClient } from 'mongodb';

try {
  loadEnvFile('.env.telemetry-simulator');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required simulator configuration: ${name}`);
  }
  return value;
}

async function main() {
  const uri = required('MONGODB_URI');
  const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
  const serialNumber = required('SIM_SERIAL_NUMBER');
  const topicSource = process.env.SIM_TOPIC_SOURCE?.trim() || serialNumber;
  const entityId = required('SIM_ENTITY_ID');
  const entityKind = process.env.SIM_ENTITY_KIND?.trim() || 'EQUIPMENT';

  if (entityKind !== 'DEVICE' && entityKind !== 'EQUIPMENT') {
    throw new Error('SIM_ENTITY_KIND must be DEVICE or EQUIPMENT.');
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const collection = client.db(databaseName).collection('telemetry_sources');
    const existing = await collection.findOne({
      $or: [{ id: `sim-${topicSource}` }, { topicSource }],
    });

    if (existing) {
      console.log(
        `[sim] telemetry source already exists: id=${existing.id} topicSource=${existing.topicSource}`,
      );
      return;
    }

    await collection.insertOne({
      id: `sim-${topicSource}`,
      entityId,
      entityKind,
      topicSource,
      expectedSerialNumber: serialNumber,
      protocolProfile: 'myems-appm-breaker-v1',
      rawSchemaVersion: 'legacy-appm-v1',
      staleAfterSeconds: 30,
      enabled: true,
    });

    console.log(
      `[sim] telemetry source provisioned: topicSource=${topicSource} entityId=${entityId} sn=${serialNumber}`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(
    `[sim] provision failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
