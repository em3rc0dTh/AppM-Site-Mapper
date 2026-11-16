import { describe, expect, it } from 'vitest';

import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

describe('process singleton registry', () => {
  it('returns one shared value for the same runtime key', () => {
    const key = `test-singleton-${crypto.randomUUID()}`;
    let creations = 0;

    const first = getProcessSingleton(key, () => {
      creations += 1;
      return { id: crypto.randomUUID() };
    });

    const second = getProcessSingleton(key, () => {
      creations += 1;
      return { id: crypto.randomUUID() };
    });

    expect(second).toBe(first);
    expect(creations).toBe(1);
  });

  it('keeps different runtime keys isolated', () => {
    const prefix = `test-singleton-${crypto.randomUUID()}`;

    const first = getProcessSingleton(`${prefix}-a`, () => ({ value: 'a' }));
    const second = getProcessSingleton(`${prefix}-b`, () => ({ value: 'b' }));

    expect(first).not.toBe(second);
    expect(first.value).toBe('a');
    expect(second.value).toBe('b');
  });
});
