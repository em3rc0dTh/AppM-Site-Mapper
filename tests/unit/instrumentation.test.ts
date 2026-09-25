import { describe, expect, it } from 'vitest';

import { register, validateServerEnvironment } from '@/instrumentation';

describe('server bootstrap environment validation', () => {
  it('fails closed when production starts without APP_ENV', async () => {
    await expect(validateServerEnvironment(undefined, 'production')).rejects.toThrow(
      'APP_ENV is required when NODE_ENV=production.',
    );
  });

  it('accepts an explicit production environment', async () => {
    await expect(validateServerEnvironment('production', 'production')).resolves.toBeUndefined();
  });

  it('registers successfully in the CI test environment', async () => {
    await expect(register()).resolves.toBeUndefined();
  });
});
