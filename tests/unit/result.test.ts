import { describe, expect, it } from 'vitest';

import { failure, success } from '../../src/shared/domain/result';

describe('Result', () => {
  it('creates a successful result without losing the value', () => {
    expect(success({ id: 'site-1' })).toEqual({
      ok: true,
      value: { id: 'site-1' },
    });
  });

  it('creates a failed result without losing the error', () => {
    expect(failure('invalid')).toEqual({
      ok: false,
      error: 'invalid',
    });
  });
});
