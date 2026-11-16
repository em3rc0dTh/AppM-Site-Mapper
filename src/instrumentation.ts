export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SITE_MAPPER_SEED_PROFILE?.trim()) {
    const { getMongoDatabase } = await import('./shared/infrastructure/mongodb/client');
    await getMongoDatabase();
  }
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.TELEMETRY_ENABLED === 'true') {
    const { getTelemetryRuntime } =
      await import('./modules/telemetry/infrastructure/telemetry-runtime');
    await getTelemetryRuntime();
  }
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.INDUSTRIAL_TIMESCALE_ENABLED === 'true'
  ) {
    const { startIndustrialHistoryDelivery } =
      await import('./modules/telemetry/infrastructure/industrial/timescale-outbox');
    startIndustrialHistoryDelivery();
  }
}
