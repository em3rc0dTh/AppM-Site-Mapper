import { describe, expect, it } from 'vitest';
import { loginDestination } from '@/shared/ui/login-destination';
import { topologyHref } from '@/shared/ui/topology-navigation';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

describe('physical navigation destinations', () => {
  it('rejects external or malformed post-login destinations', () => {
    for (const path of [
      null,
      '//evil.invalid',
      '/\\evil.invalid',
      'https://evil.invalid',
      '/settings',
      '/topology/\r\n',
    ]) {
      expect(loginDestination(path)).toBe('/workspace');
    }
    expect(loginDestination('/rack/example')).toBe('/rack/example');
    expect(loginDestination('/topology/network/n/site/s')).toBe('/topology/network/n/site/s');
  });
  it('uses one rack presentation destination while retaining canonical topology identity', async () => {
    const repository = new MemoryTopologyRepository();
    const service = new TopologyService(repository);
    const rack = {
      id: 'rack',
      parentId: 'position',
      kind: 'CONTAINER_RACK' as const,
      variant: 'RACK' as const,
      name: 'Rack',
      totalU: 42,
      cas: [],
      lifecycle: 'ACTIVE' as const,
      createdAt: '2026-09-25T00:00:00Z',
      updatedAt: '2026-09-25T00:00:00Z',
    };
    expect(await topologyHref(service, rack)).toBe('/rack/rack');
  });
});
