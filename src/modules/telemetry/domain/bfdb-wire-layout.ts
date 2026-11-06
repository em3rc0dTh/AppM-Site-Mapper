export type BfdbWireProfile = 'FIELD_DUAL_12' | 'LEGACY_SINGLE_24';
export type BfdbWireChannel = 1 | 2;
export type BfdbPanelLabel = 'A3' | 'A2' | 'B3' | 'B2';

export interface BfdbWirePoint {
  readonly rawPointId: string;
  readonly bindingPointId: string;
  readonly channel: BfdbWireChannel;
  readonly panelLabel: BfdbPanelLabel;
  readonly panelPosition: number;
  readonly side: 'A' | 'B';
  readonly sidePosition: number;
  readonly modbusPointId: string;
  readonly fields: {
    readonly voltage: string;
    readonly current: string;
    readonly power: string;
    readonly energy: string;
  };
}

const FIELD_GROUPS = {
  '1': { panelLabel: 'A3', side: 'A', sideBase: 0 },
  '3': { panelLabel: 'A2', side: 'A', sideBase: 24 },
  '5': { panelLabel: 'B3', side: 'B', sideBase: 0 },
  '7': { panelLabel: 'B2', side: 'B', sideBase: 24 },
} as const;

const LEGACY_GROUPS = {
  '1': { panelLabel: 'A3', side: 'A', sideBase: 0 },
  '2': { panelLabel: 'A2', side: 'A', sideBase: 24 },
  '3': { panelLabel: 'B3', side: 'B', sideBase: 0 },
  '4': { panelLabel: 'B2', side: 'B', sideBase: 24 },
} as const;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

export function detectBfdbWireProfile(
  reported: Readonly<Record<string, unknown>>,
): BfdbWireProfile {
  for (const [rawPointId, rawValue] of Object.entries(reported)) {
    if (/^0_[57]_/.test(rawPointId)) return 'FIELD_DUAL_12';
    const raw = record(rawValue);
    if (raw && ['U2', 'I2', 'P2', 'EP2'].some((field) => Object.hasOwn(raw, field))) {
      return 'FIELD_DUAL_12';
    }
  }
  return 'LEGACY_SINGLE_24';
}

export function isFieldStatusOnlyPoint(
  rawPointId: string,
  profile: BfdbWireProfile,
): boolean {
  if (profile !== 'FIELD_DUAL_12') return false;
  const match = /^0_([1357])_([1-9]|1[0-9]|2[0-4])$/.exec(rawPointId);
  return Boolean(match && Number(match[2]) > 12);
}

function fields(channel: BfdbWireChannel) {
  return {
    voltage: `U${channel}`,
    current: `I${channel}`,
    power: `P${channel}`,
    energy: `EP${channel}`,
  } as const;
}

function makePoint(
  rawPointId: string,
  channel: BfdbWireChannel,
  panelLabel: BfdbPanelLabel,
  side: 'A' | 'B',
  sideBase: number,
  rawPosition: number,
  profile: BfdbWireProfile,
): BfdbWirePoint {
  const panelPosition = rawPosition + (channel - 1) * 12;
  const sidePosition = sideBase + panelPosition;
  return {
    rawPointId,
    bindingPointId:
      profile === 'FIELD_DUAL_12' ? `${rawPointId}#${channel}` : rawPointId,
    channel,
    panelLabel,
    panelPosition,
    side,
    sidePosition,
    modbusPointId: `0_${side === 'A' ? 1 : 2}_${sidePosition}`,
    fields: fields(channel),
  };
}

export function expandBfdbWirePoint(
  rawPointId: string,
  rawValue: unknown,
  profile: BfdbWireProfile,
): readonly BfdbWirePoint[] {
  if (!record(rawValue)) return [];

  if (profile === 'FIELD_DUAL_12') {
    const match = /^0_([1357])_([1-9]|1[0-2])$/.exec(rawPointId);
    if (!match) return [];
    const group = FIELD_GROUPS[match[1] as keyof typeof FIELD_GROUPS];
    const position = Number(match[2]);
    return [
      makePoint(
        rawPointId,
        1,
        group.panelLabel,
        group.side,
        group.sideBase,
        position,
        profile,
      ),
      makePoint(
        rawPointId,
        2,
        group.panelLabel,
        group.side,
        group.sideBase,
        position,
        profile,
      ),
    ];
  }

  const match = /^0_([1-4])_([1-9]|1[0-9]|2[0-4])$/.exec(rawPointId);
  if (!match) return [];
  const group = LEGACY_GROUPS[match[1] as keyof typeof LEGACY_GROUPS];
  return [
    makePoint(
      rawPointId,
      1,
      group.panelLabel,
      group.side,
      group.sideBase,
      Number(match[2]),
      profile,
    ),
  ];
}

export function findBfdbWirePointByBindingId(
  sourcePointId: string,
  reported: Readonly<Record<string, unknown>>,
  profile = detectBfdbWireProfile(reported),
): BfdbWirePoint | null {
  for (const [rawPointId, rawValue] of Object.entries(reported)) {
    for (const point of expandBfdbWirePoint(rawPointId, rawValue, profile)) {
      if (point.bindingPointId === sourcePointId) return point;
    }
  }
  return null;
}
