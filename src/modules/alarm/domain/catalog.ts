import type { AlarmDefinition } from '@/modules/alarm/domain/entities';

export const ALARM_DEFINITIONS: readonly AlarmDefinition[] = [
  {
    code: 'TELEMETRY_LOSS',
    family: 'COMMUNICATION',
    name: 'Telemetry loss',
    description: 'Expected telemetry is no longer observed within the configured loss policy.',
    applicableTargetTypes: ['DEVICE', 'EQUIPMENT'],
    defaultSeverity: 'WARNING',
    ruleVersion: 'v1',
    enabled: true,
  },
  {
    code: 'LOW_VOLTAGE',
    family: 'ELECTRICAL',
    name: 'Low voltage',
    description:
      'Accepted voltage is below the commissioned threshold for the required debounce period.',
    applicableTargetTypes: ['EQUIPMENT'],
    defaultSeverity: 'WARNING',
    ruleVersion: 'v1',
    enabled: true,
  },
  {
    code: 'OVERCURRENT',
    family: 'ELECTRICAL',
    name: 'Overcurrent',
    description:
      'Accepted current is above the commissioned threshold for the required debounce period.',
    applicableTargetTypes: ['EQUIPMENT'],
    defaultSeverity: 'CRITICAL',
    ruleVersion: 'v1',
    enabled: true,
  },
  {
    code: 'POWER_LOSS',
    family: 'CORRELATED',
    name: 'Power loss',
    description:
      'Electrical evidence and optional independent corroboration indicate loss of power.',
    applicableTargetTypes: ['EQUIPMENT'],
    defaultSeverity: 'CRITICAL',
    ruleVersion: 'v1',
    enabled: true,
  },
  {
    code: 'FUSE_ALARM',
    family: 'EQUIPMENT',
    name: 'Fuse alarm',
    description: 'Controller evidence explicitly reports a fuse condition.',
    applicableTargetTypes: ['DEVICE', 'EQUIPMENT'],
    defaultSeverity: 'CRITICAL',
    ruleVersion: 'v1',
    enabled: true,
  },
  {
    code: 'CONTROLLER_ALARM',
    family: 'EQUIPMENT',
    name: 'Controller alarm',
    description: 'Controller evidence explicitly reports an equipment condition.',
    applicableTargetTypes: ['DEVICE', 'EQUIPMENT'],
    defaultSeverity: 'WARNING',
    ruleVersion: 'v1',
    enabled: true,
  },
  {
    code: 'DATA_QUALITY_DEGRADED',
    family: 'COMMUNICATION',
    name: 'Data quality degraded',
    description:
      'Accepted observations are insufficient, stale, invalid, or incomplete for normal operation.',
    applicableTargetTypes: ['DEVICE', 'EQUIPMENT'],
    defaultSeverity: 'WARNING',
    ruleVersion: 'v1',
    enabled: true,
  },
];

export function alarmDefinition(code: string): AlarmDefinition | null {
  return ALARM_DEFINITIONS.find((item) => item.code === code) ?? null;
}
