import type {
  DeviceType,
  EquipmentChildMode,
  EquipmentType,
} from '@/modules/topology/domain/entities';

export const DEVICE_TYPES = [
  'NETWORK_ELEMENT',
  'BDFB',
  'SERVER',
  'UPS',
  'RECTIFIER',
  'POWER_SYSTEM',
  'CUSTOM',
] as const satisfies readonly DeviceType[];

export const EQUIPMENT_TYPES = [
  'CHASSIS',
  'SHELF',
  'SUB_SHELF',
  'FRAME',
  'PANEL',
  'CIRCUIT_BREAKER',
  'POWER_SUPPLY',
  'POWER_MODULE',
  'CONTROLLER_BOARD',
  'NETWORK_BOARD',
  'PLUGGABLE_MODULE',
  'FAN',
  'CUSTOM',
] as const satisfies readonly EquipmentType[];

const deviceTypes = new Set<DeviceType>(DEVICE_TYPES);
const equipmentTypes = new Set<EquipmentType>(EQUIPMENT_TYPES);

export function parseDeviceType(value: unknown): DeviceType | undefined {
  return typeof value === 'string' && deviceTypes.has(value as DeviceType)
    ? (value as DeviceType)
    : undefined;
}

export function parseEquipmentType(value: unknown): EquipmentType | undefined {
  return typeof value === 'string' && equipmentTypes.has(value as EquipmentType)
    ? (value as EquipmentType)
    : undefined;
}

export function parseEquipmentChildMode(value: unknown): EquipmentChildMode | undefined {
  return value === 'DYNAMIC' || value === 'POSITIONAL' ? value : undefined;
}
