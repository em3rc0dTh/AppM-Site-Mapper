export async function validateServerEnvironment(
  appEnvironment: string | undefined,
  nodeEnvironment: string | undefined,
): Promise<void> {
  const { parseAppEnvironment } = await import('./config/env');
  parseAppEnvironment(appEnvironment, nodeEnvironment);
}

export async function register(): Promise<void> {
  await validateServerEnvironment(process.env.APP_ENV, process.env.NODE_ENV);
}
