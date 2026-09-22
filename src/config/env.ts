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
