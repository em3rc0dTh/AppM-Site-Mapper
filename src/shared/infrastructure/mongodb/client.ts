import { MongoClient, type Db } from 'mongodb';

import { isProductionDeployment, requireRuntimeSecret } from '@/config/env';
import { ensurePersistenceIndexes } from '@/shared/infrastructure/mongodb/bootstrap';

let clientPromise: Promise<MongoClient> | undefined;
let databasePromise: Promise<Db> | undefined;

/** Reject the unauthenticated, plaintext MongoDB lab URI in production. */
export function assertMongoProductionSecurity(uri: string, production: boolean): void {
  if (!production) return;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error('Production MongoDB URI is invalid');
  }
  if (url.protocol !== 'mongodb:' && url.protocol !== 'mongodb+srv:') {
    throw new Error('Production MongoDB URI must use mongodb:// or mongodb+srv://');
  }
  if (!url.username || !url.password) {
    throw new Error('Production MongoDB requires authenticated connection credentials');
  }
  const options = new Map(
    [...url.searchParams.entries()].map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]),
  );
  if (
    ['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'].some(
      (key) => options.get(key) === 'true',
    )
  ) {
    throw new Error('Production MongoDB must validate TLS certificates and hostnames');
  }
  if (options.get('tls') === 'false' || options.get('ssl') === 'false') {
    throw new Error('Production MongoDB cannot disable TLS');
  }
  if (
    url.protocol !== 'mongodb+srv:' &&
    options.get('tls') !== 'true' &&
    options.get('ssl') !== 'true'
  ) {
    throw new Error('Production MongoDB requires TLS');
  }
}

export function getClient(): Promise<MongoClient> {
  const uri = requireRuntimeSecret('MONGODB_URI', process.env.MONGODB_URI);
  assertMongoProductionSecurity(uri, isProductionDeployment());

  clientPromise ??= new MongoClient(uri, {
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
  }).connect();

  return clientPromise;
}

export function getMongoDatabase(): Promise<Db> {
  databasePromise ??= getClient().then(async (client) => {
    const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
    const database = client.db(databaseName);
    await ensurePersistenceIndexes(database);
    return database;
  });

  return databasePromise;
}
