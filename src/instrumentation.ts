export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { parseAppEnvironment } = await import('./config/env');
  parseAppEnvironment(process.env.APP_ENV);
}
