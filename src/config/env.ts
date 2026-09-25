export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';

const allowedAppEnvironments = new Set<AppEnvironment>([
  'development',
  'test',
  'staging',
  'production',
]);

export function parseAppEnvironment(
  value: string | undefined,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): AppEnvironment {
  const candidate = value?.trim();

  if (candidate) {
    if (!allowedAppEnvironments.has(candidate as AppEnvironment)) {
      throw new Error('APP_ENV must be one of development, test, staging or production.');
    }

    return candidate as AppEnvironment;
  }

  if (nodeEnvironment === 'production') {
    throw new Error('APP_ENV is required when NODE_ENV=production.');
  }

  if (nodeEnvironment === 'test') {
    return 'test';
  }

  return 'development';
}

export function requireRuntimeSecret(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing required runtime secret: ${name}`);
  }

  return value;
}
