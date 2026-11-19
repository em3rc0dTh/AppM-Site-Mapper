import { describe, expect, it } from 'vitest';

import {
  findPowerTargetRackAssociation,
  POWER_TARGET_IDENTITY_SOURCE,
  POWER_TARGET_RACK_ASSOCIATIONS,
} from '@/seeds/seed-01-power-target-identity';

describe('seed-01 power target rack/AID workbook identity', () => {
  it('captures the complete Hoja1 rack association map', () => {
    expect(POWER_TARGET_IDENTITY_SOURCE).toBe('Lista de Equipos QDF mop v2 AID + RackAID.xlsx');
    expect(POWER_TARGET_RACK_ASSOCIATIONS).toHaveLength(19);
    expect(POWER_TARGET_RACK_ASSOCIATIONS.filter((item) => item.kind === 'PDU')).toHaveLength(3);
    expect(POWER_TARGET_RACK_ASSOCIATIONS.filter((item) => item.kind === 'EQUIPMENT')).toHaveLength(
      16,
    );
  });

  it('keeps PDU 01 rack-scoped because the local PDU name can repeat', () => {
    expect(findPowerTargetRackAssociation('QDF-2', '010202.10', 'PDU 01')).toMatchObject({
      rackAid: 'RACK::010202.10',
      baseAid: 'RACK::010202.10::PDU01',
      feedAidA: 'RACK::010202.10::PDU01::A',
      feedAidB: 'RACK::010202.10::PDU01::B',
    });
    expect(findPowerTargetRackAssociation('QDF-5', '010208.13', 'PDU 01')).toMatchObject({
      rackAid: 'RACK::010208.13',
      baseAid: 'RACK::010208.13::PDU01',
      feedAidA: 'RACK::010208.13::PDU01::A',
      feedAidB: 'RACK::010208.13::PDU01::B',
    });
    expect(findPowerTargetRackAssociation('QDF-5', '010208.14', 'PDU 01')).toMatchObject({
      rackAid: 'RACK::010208.14',
      baseAid: 'RACK::010208.14::PDU01',
      feedAidA: 'RACK::010208.14::PDU01::A',
      feedAidB: 'RACK::010208.14::PDU01::B',
    });
  });

  it('preserves POS-N as documentary remarks without making them endpoints', () => {
    const pdu = findPowerTargetRackAssociation('QDF-5', '010208.14', 'PDU 01');
    expect(pdu?.remarksA).toEqual(['Pos-1: MTC-9 SH10 PEM A', 'Pos-2: XTM-LUR01 PEM A']);
    expect(pdu?.remarksB).toEqual(['Pos-1: MTC-9 SH10 PEM B', 'Pos-2: XTM-LUR01 PEM B']);
  });

  it('retains association-only equipment that has no breaker row without inventing power', () => {
    expect(findPowerTargetRackAssociation('QDF-4', '010205.16', 'Orion')).toMatchObject({
      kind: 'EQUIPMENT',
      rackAid: 'RACK::010205.16',
      name: 'Orion',
    });
  });
});
