import type { TopologyService } from '@/modules/topology/application/topology-service';
import type { TopologyNode } from '@/modules/topology/domain/entities';

/** One presentation destination per canonical entity; legacy deep links redirect. */
export function topologyHref(service: TopologyService, node: TopologyNode): Promise<string> {
  return node.kind === 'CONTAINER_RACK' && node.variant === 'RACK'
    ? Promise.resolve(`/rack/${encodeURIComponent(node.id)}`)
    : service.buildDeepLink(node.id);
}
