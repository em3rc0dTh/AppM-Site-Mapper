import type { AlarmPathItem } from '@/modules/alarm/domain/entities';

const STRUCTURAL_KINDS = new Set([
  'SITE',
  'STRUCTURE',
  'LEVEL',
  'CONTAINER_CLUSTER_BAY',
  'CONTAINER_RACK',
]);

export function compactAlarmPath(path: readonly AlarmPathItem[]): readonly AlarmPathItem[] {
  if (!path.length) return path;

  const roomIndex = path.findIndex((item) => item.kind === 'ROOM_SUBSTRUCTURE');
  const deviceIndex = path.findIndex((item, index) => index > roomIndex && item.kind === 'DEVICE');

  if (roomIndex >= 0 && deviceIndex > roomIndex) {
    return [
      path[roomIndex]!,
      ...path.slice(deviceIndex).filter((item) => !STRUCTURAL_KINDS.has(item.kind)),
    ];
  }

  if (deviceIndex >= 0) {
    return path.slice(deviceIndex).filter((item) => !STRUCTURAL_KINDS.has(item.kind));
  }

  if (roomIndex >= 0) {
    return path.slice(roomIndex).filter((item) => !STRUCTURAL_KINDS.has(item.kind));
  }

  return path.slice(-3);
}
