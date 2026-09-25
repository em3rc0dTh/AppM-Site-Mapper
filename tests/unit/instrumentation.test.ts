import { afterEach, describe, expect, it } from 'vitest';

import { register } from '@/instrumentation';

const originalAppEnvironment = process.env.APP_ENV;
const originalNodeEnvironment = process.env.NODE_ENV;

afterEach(() => {
  if (originalAppEnvironment === undefined) {
    delete process.env.APP_ENV;
  } else {
    process.env.APP_ENV = originalAppEnvironment;
  }

  if (originalNodeEnvironment === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnvironment;
  }
});

describe('server bootstrap environment validation', () => {
  it('fails closed when production starts without APP_ENV', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APP_ENV;

    await expect(register()).rejects.toThrow('APP_ENV is required when NODE_ENV=production.');
  });

  it('accepts an explicit production environment', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'production';

    await expect(register()).resolves.toBeUndefined();
  });
});
