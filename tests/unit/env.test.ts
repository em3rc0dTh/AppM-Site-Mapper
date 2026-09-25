import { describe, expect, it } from 'vitest';

import { parseAppEnvironment } from '@/config/env';

describe('application environment policy', () => {
  it('uses explicit APP_ENV when valid', () => {
    expect(parseAppEnvironment('production', 'production')).toBe('production');
    expect(parseAppEnvironment('staging', 'production')).toBe('staging');
  });

  it('infers test for a non-production test runtime', () => {
    expect(parseAppEnvironment(undefined, 'test')).toBe('test');
  });

  it('infers development for an explicit local non-production runtime', () => {
    expect(parseAppEnvironment(undefined, 'development')).toBe('development');
  });

  it('fails closed when a production Node runtime has no APP_ENV', () => {
    expect(() => parseAppEnvironment(undefined, 'production')).toThrow(
      'APP_ENV is required when NODE_ENV=production.',
    );
    expect(() => parseAppEnvironment('   ', 'production')).toThrow(
      'APP_ENV is required when NODE_ENV=production.',
    );
  });

  it('rejects unknown explicit environments', () => {
    expect(() => parseAppEnvironment('prod', 'production')).toThrow(
      'APP_ENV must be one of development, test, staging or production.',
    );
  });
});
