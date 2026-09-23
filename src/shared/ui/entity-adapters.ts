import type { TopologyNode } from '@/modules/topology/domain/entities';
import type { InspectorEntity } from './entity-inspector';

export function topologyInspector(node: TopologyNode, href?: string): InspectorEntity {
  const fields: { label: string; value: string | number }[] = [
    { label: 'Name', value: node.name },
    { label: 'Lifecycle', value: node.lifecycle },
  ];
  if ('category' in node && node.category) fields.push({ label: 'Category', value: node.category });
  if ('serialNumber' in node && node.serialNumber)
    fields.push({ label: 'Serial number', value: node.serialNumber });
  if ('coordinate' in node)
    fields.push({ label: 'Position', value: `${node.coordinate.row}-${node.coordinate.column}` });
  if ('totalU' in node && node.totalU)
    fields.push({ label: 'Capacity', value: `${node.totalU} U` });
  if ('dimensionsMm' in node && node.dimensionsMm)
    fields.push({
      label: 'Footprint',
      value: `${node.dimensionsMm.width} × ${node.dimensionsMm.depth} mm`,
    });
  const actions = href ? [{ label: 'Open entity', href }] : [];
  if (node.kind === 'ROOM_SUBSTRUCTURE')
    actions.push({ label: 'Open Blueprint', href: `/blueprint/${node.id}` });
  if (node.kind === 'CONTAINER_RACK' && node.variant === 'RACK')
    actions.push({ label: 'Open elevation', href: `/rack/${node.id}` });
  return {
    name: node.name,
    kind: node.kind,
    status: node.lifecycle,
    sections: [
      { title: 'Overview', fields },
      {
        title: 'Identity',
        fields: [
          { label: 'Entity ID', value: node.id },
          { label: 'Parent ID', value: node.parentId ?? 'Topology root' },
        ],
      },
    ],
    actions,
  };
}
