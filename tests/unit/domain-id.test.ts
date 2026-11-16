import { describe, expect, it } from 'vitest';

import { createDomainId } from '@/shared/domain/entity';

describe('createDomainId', () => {
  it('creates opaque UUIDv4 identifiers', () => {
    expect(createDomainId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
