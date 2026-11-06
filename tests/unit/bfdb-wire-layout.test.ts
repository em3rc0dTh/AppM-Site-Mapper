import { describe, expect, it } from 'vitest';

import {
  bindingPointIdsForWirePoint,
  detectBfdbWireProfile,
  expandBfdbWirePoint,
  findBfdbWirePointByBindingId,
  isFieldStatusOnlyPoint,
} from '@/modules/telemetry/domain/bfdb-wire-layout';

describe('Acrel BFDB field wire layout', () => {
  const reported = {
    '0_1_1': { U1: '12.7', U2: '12.6', I1: '1', I2: '2', P1: '12', P2: '24', EP1: '1', EP2: '2' },
    '0_3_12': { U1: '12.5', U2: '12.4' },
    '0_5_1': { U1: '12.3', U2: '12.2' },
    '0_7_24': { state: 'ONLINE' },
  } as const;

  it('detects the real 1/3/5/7 dual-12 field profile', () => {
    expect(detectBfdbWireProfile(reported)).toBe('FIELD_DUAL_12');
  });

  it('maps group 3 channel 1/2 to A2 positions 12/24 and A side 36/48', () => {
    const points = expandBfdbWirePoint('0_3_12', reported['0_3_12'], 'FIELD_DUAL_12');
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      panelLabel: 'A2',
      panelPosition: 12,
      side: 'A',
      sidePosition: 36,
      bindingPointId: '0_3_12#1',
      modbusPointId: '0_1_36',
    });
    expect(points[1]).toMatchObject({
      panelLabel: 'A2',
      panelPosition: 24,
      side: 'A',
      sidePosition: 48,
      bindingPointId: '0_3_12#2',
      modbusPointId: '0_1_48',
    });
  });

  it('maps group 5 into B positions 01..24', () => {
    const points = expandBfdbWirePoint('0_5_1', reported['0_5_1'], 'FIELD_DUAL_12');
    expect(points[0]).toMatchObject({
      panelLabel: 'B3',
      panelPosition: 1,
      sidePosition: 1,
      modbusPointId: '0_2_1',
    });
    expect(points[1]).toMatchObject({
      panelLabel: 'B3',
      panelPosition: 13,
      sidePosition: 13,
      modbusPointId: '0_2_13',
    });
  });

  it('treats field objects 13..24 as status-only shadows, not extra circuits', () => {
    expect(isFieldStatusOnlyPoint('0_7_24', 'FIELD_DUAL_12')).toBe(true);
    expect(expandBfdbWirePoint('0_7_24', reported['0_7_24'], 'FIELD_DUAL_12')).toEqual([]);
  });


  it('treats an explicit raw field binding as channel 1 only', () => {
    const points = expandBfdbWirePoint('0_1_1', reported['0_1_1'], 'FIELD_DUAL_12');
    expect(bindingPointIdsForWirePoint(points[0]!, 'FIELD_DUAL_12')).toEqual([
      '0_1_1#1',
      '0_1_1',
    ]);
    expect(bindingPointIdsForWirePoint(points[1]!, 'FIELD_DUAL_12')).toEqual(['0_1_1#2']);
    expect(findBfdbWirePointByBindingId('0_1_1', reported)).toMatchObject({
      channel: 1,
      modbusPointId: '0_1_1',
    });
  });

  it('can resolve a channel-qualified binding back to its raw frame and Modbus identity', () => {
    expect(findBfdbWirePointByBindingId('0_1_1#2', reported)).toMatchObject({
      rawPointId: '0_1_1',
      channel: 2,
      panelLabel: 'A3',
      panelPosition: 13,
      modbusPointId: '0_1_13',
    });
  });

  it('keeps measured 1/2/3/4 24-position frames in legacy mode even when U2 exists', () => {
    const legacy = {
      '0_1_1': { U1: '12.0', U2: '0.00' },
      '0_1_24': { U1: '12.1', U2: '0.00' },
      '0_2_1': { U1: '12.2', U2: '0.00' },
    };
    expect(detectBfdbWireProfile(legacy)).toBe('LEGACY_SINGLE_24');
  });

  it('retains the old 1/2/3/4 single-channel shape only as compatibility mode', () => {
    const legacy = { '0_4_24': { U1: '12.0' } };
    expect(detectBfdbWireProfile(legacy)).toBe('LEGACY_SINGLE_24');
    expect(expandBfdbWirePoint('0_4_24', legacy['0_4_24'], 'LEGACY_SINGLE_24')[0]).toMatchObject({
      panelLabel: 'B2',
      panelPosition: 24,
      modbusPointId: '0_2_48',
      bindingPointId: '0_4_24',
    });
  });
});
