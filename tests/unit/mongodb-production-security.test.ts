import { describe, expect, it } from 'vitest';
import { assertMongoProductionSecurity } from '@/shared/infrastructure/mongodb/client';

describe('production MongoDB trust boundary', () => {
  it('allows unencrypted laboratory URI only outside production', () => {
    expect(() =>
      assertMongoProductionSecurity('mongodb://localhost:27017/test', false),
    ).not.toThrow();
    expect(() => assertMongoProductionSecurity('mongodb://localhost:27017/test', true)).toThrow();
  });
  it('requires both credentials and TLS for non-SRV MongoDB', () => {
    expect(() =>
      assertMongoProductionSecurity('mongodb://u:p@mongo.internal:27017/db', true),
    ).toThrow();
    expect(() =>
      assertMongoProductionSecurity('mongodb://u:p@mongo.internal:27017/db?tls=true', true),
    ).not.toThrow();
    expect(() =>
      assertMongoProductionSecurity('mongodb+srv://u:p@cluster.example/db', true),
    ).not.toThrow();
    expect(() =>
      assertMongoProductionSecurity('mongodb+srv://u:p@cluster.example/db?tls=false', true),
    ).toThrow();
    expect(() =>
      assertMongoProductionSecurity('mongodb://u:p@mongo.internal:27017/db?tls=true&tlsAllowInvalidCertificates=true', true),
    ).toThrow();
  });
});
