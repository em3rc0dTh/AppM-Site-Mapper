import type { Db } from 'mongodb';

import { applySeed01, SEED_01_PROFILE, type Seed01Summary } from '@/seeds/seed-01';

export type RuntimeSeedResult = Seed01Summary | null;

/**
 * Product-image seed gate.
 *
 * Empty means "do not seed". The current customer seed is intentionally pinned
 * to database seed-01 so an operator cannot accidentally apply Telxius data to
 * another Mongo database by exporting one environment variable.
 */
export async function applyConfiguredRuntimeSeed(database: Db): Promise<RuntimeSeedResult> {
  const profile = process.env.SITE_MAPPER_SEED_PROFILE?.trim();
  if (!profile) return null;

  if (profile !== SEED_01_PROFILE) {
    throw new Error(`Unsupported SITE_MAPPER_SEED_PROFILE: ${profile}`);
  }
  if (database.databaseName !== SEED_01_PROFILE) {
    throw new Error(
      `SEED_PROFILE_DATABASE_MISMATCH: ${profile} requires MONGODB_DB_NAME=${SEED_01_PROFILE}`,
    );
  }

  const result = await applySeed01(database);
  const confirmedBreakers = result.bdfbs.reduce((sum, item) => sum + item.breakerCount, 0);
  console.info(
    `[site-mapper-seed] profile=${result.profile} version=${result.version} status=${
      result.alreadyApplied ? 'already-applied' : 'applied'
    } bdfbs=${result.bdfbs.length} confirmedBreakers=${confirmedBreakers}`,
  );
  return result;
}
