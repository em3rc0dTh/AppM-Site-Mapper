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
  if (appEnv !== undefined) return ['staging', 'production'].includes(parseAppEnvironment(appEnv));
  return nodeEnv === 'production';
}

/** Memory is opt-in and is never inferred from a missing deployment setting. */
export function persistenceMode(): 'memory' | 'mongodb' {
  const configured = process.env.APP_PERSISTENCE?.trim();
  const environment = process.env.APP_ENV;
  if (environment !== undefined) parseAppEnvironment(environment);
  if (configured !== 'memory' && configured !== 'mongodb') {
    throw new Error('APP_PERSISTENCE must explicitly be memory or mongodb.');
  }
  if (
    configured === 'memory' &&
    (isProductionDeployment() || !['development', 'test'].includes(environment ?? ''))
  ) {
    throw new Error('Memory persistence requires explicit APP_ENV=development or test.');
  }
  if (configured === 'mongodb') {
    requireRuntimeSecret('MONGODB_URI', process.env.MONGODB_URI);
    requireRuntimeSecret('MONGODB_DB_NAME', process.env.MONGODB_DB_NAME);
  }
  return configured;
}
