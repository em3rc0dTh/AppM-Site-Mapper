export async function register(): Promise<void> {
  const { parseAppEnvironment } = await import('./config/env');
  parseAppEnvironment(process.env.APP_ENV);
}
