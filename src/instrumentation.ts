export async function register() {
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
