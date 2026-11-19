export const POWER_TARGET_IDENTITY_SOURCE =
  'Lista de Equipos QDF mop v2 AID + RackAID.xlsx' as const;

export type DeclaredRackAssociationKind = 'EQUIPMENT' | 'PDU';

export interface DeclaredRackAssociation {
  readonly qdf: 'QDF-2' | 'QDF-4' | 'QDF-5';
  readonly footprint: string;
  readonly rackAid: string;
  readonly kind: DeclaredRackAssociationKind;
  readonly name: string;
  readonly baseAid?: string;
  readonly feedAidA?: string;
  readonly feedAidB?: string;
  readonly remarksA?: readonly string[];
  readonly remarksB?: readonly string[];
}

/**
 * Workbook Hoja1 — authoritative rack ↔ remote power-target association map.
 *
 * This is documentary identity only. It does not materialize remote Equipment/PDU
 * topology, Rack CAS placement, AccessPorts or PowerPaths.
 */
export const POWER_TARGET_RACK_ASSOCIATIONS: readonly DeclaredRackAssociation[] = [
  {
    qdf: 'QDF-2',
    footprint: '010202.10',
    rackAid: 'RACK::010202.10',
    kind: 'PDU',
    name: 'PDU 01',
    baseAid: 'RACK::010202.10::PDU01',
    feedAidA: 'RACK::010202.10::PDU01::A',
    feedAidB: 'RACK::010202.10::PDU01::B',
  },
  {
    qdf: 'QDF-2',
    footprint: '010202.09',
    rackAid: 'RACK::010202.09',
    kind: 'EQUIPMENT',
    name: 'GRTLuren3',
  },
  {
    qdf: 'QDF-2',
    footprint: '010202.11',
    rackAid: 'RACK::010202.11',
    kind: 'EQUIPMENT',
    name: 'DTX-LUR-FP2-01',
  },
  {
    qdf: 'QDF-4',
    footprint: '010206.20',
    rackAid: 'RACK::010206.20',
    kind: 'EQUIPMENT',
    name: 'BB-LUR-04',
  },
  {
    qdf: 'QDF-4',
    footprint: '010206.19',
    rackAid: 'RACK::010206.19',
    kind: 'EQUIPMENT',
    name: 'PL-LUR-FPN3-1',
  },
  {
    qdf: 'QDF-4',
    footprint: '010206.15',
    rackAid: 'RACK::010206.15',
    kind: 'EQUIPMENT',
    name: 'DTN-LUR-FP4-01',
  },
  {
    qdf: 'QDF-4',
    footprint: '010205.20',
    rackAid: 'RACK::010205.20',
    kind: 'EQUIPMENT',
    name: 'BB-LUR-FPN3-3',
  },
  {
    qdf: 'QDF-4',
    footprint: '010205.16',
    rackAid: 'RACK::010205.16',
    kind: 'EQUIPMENT',
    name: 'Orion',
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.12',
    rackAid: 'RACK::010208.12',
    kind: 'EQUIPMENT',
    name: 'WS-LUR-04',
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.12',
    rackAid: 'RACK::010208.12',
    kind: 'EQUIPMENT',
    name: 'WS-LUR-01',
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.12',
    rackAid: 'RACK::010208.12',
    kind: 'EQUIPMENT',
    name: 'WS-LUR-02',
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.12',
    rackAid: 'RACK::010208.12',
    kind: 'EQUIPMENT',
    name: 'CAR-LUR-01',
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.12',
    rackAid: 'RACK::010208.12',
    kind: 'EQUIPMENT',
    name: 'WS-LUR-03',
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.13',
    rackAid: 'RACK::010208.13',
    kind: 'EQUIPMENT',
    name: 'GXLUR02',
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.13',
    rackAid: 'RACK::010208.13',
    kind: 'EQUIPMENT',
    name: 'GXLUR01',
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.13',
    rackAid: 'RACK::010208.13',
    kind: 'PDU',
    name: 'PDU 01',
    baseAid: 'RACK::010208.13::PDU01',
    feedAidA: 'RACK::010208.13::PDU01::A',
    feedAidB: 'RACK::010208.13::PDU01::B',
    remarksA: ['Pos-1: MTC-9 SH1 PEM A', 'Pos-2: MTC-9 SH4 PEM A'],
    remarksB: ['Pos-1: MTC-9 SH1 PEM B', 'Pos-2: MTC-9 SH4 PEM B'],
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.14',
    rackAid: 'RACK::010208.14',
    kind: 'PDU',
    name: 'PDU 01',
    baseAid: 'RACK::010208.14::PDU01',
    feedAidA: 'RACK::010208.14::PDU01::A',
    feedAidB: 'RACK::010208.14::PDU01::B',
    remarksA: ['Pos-1: MTC-9 SH10 PEM A', 'Pos-2: XTM-LUR01 PEM A'],
    remarksB: ['Pos-1: MTC-9 SH10 PEM B', 'Pos-2: XTM-LUR01 PEM B'],
  },
  {
    qdf: 'QDF-5',
    footprint: '010208.16',
    rackAid: 'RACK::010208.16',
    kind: 'EQUIPMENT',
    name: 'DTX-LUR-FP2-1',
  },
  {
    qdf: 'QDF-5',
    footprint: '010207.20',
    rackAid: 'RACK::010207.20',
    kind: 'EQUIPMENT',
    name: 'PL-LUR-FPO1-1',
  },
];

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase();
}

export function findPowerTargetRackAssociation(
  qdf: DeclaredRackAssociation['qdf'],
  footprint: string,
  targetName: string,
): DeclaredRackAssociation | null {
  const matches = POWER_TARGET_RACK_ASSOCIATIONS.filter(
    (item) =>
      item.qdf === qdf &&
      item.footprint === footprint.trim() &&
      normalized(item.name) === normalized(targetName),
  );
  return matches.length === 1 ? matches[0]! : null;
}
