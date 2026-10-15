export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';

const allowedAppEnvironments = new Set<AppEnvironment>([
  'development',
  'test',
  'staging',
  'production',
]);

export function parseAppEnvironment(value: string | undefined): AppEnvironment {
  const candidate = value ?? 'development';

  if (!allowedAppEnvironments.has(candidate as AppEnvironment)) {
    throw new Error('APP_ENV must be one of development, test, staging or production.');
  }

  return candidate as AppEnvironment;
}

export function requireRuntimeSecret(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing required runtime secret: ${name}`);
  }

  return value;
}

/**
 * NODE_ENV=production is mandatory for a Next.js optimized server even in a
 * local Docker lab. APP_ENV defines the actual deployment security policy.
 * Fall back to NODE_ENV when APP_ENV has not been explicitly configured.
 */
export function isProductionDeployment(
  appEnv = process.env.APP_ENV,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  if (appEnv !== undefined) return parseAppEnvironment(appEnv) === 'production';
  return nodeEnv === 'production';
}
