// Synthetic demo data shared by the demo launcher and browser certification.
export const SERIAL_NUMBER = 'DEMO25110703400009';
export const ENTITY_ID = 'demo-device-qdf-01';

function syntheticBreakers() {
  return Array.from({ length: 24 }, (_, index) => {
    const position = index + 1;

    return {
      id: `demo-breaker-panel-1-${position}`,
      variant: 'BREAKER',
      label: `CB-${String(position).padStart(2, '0')}`,
      telemetryAddress: `0_1_${position}`,
    };
  });
}

function fixed(value) {
  return Math.max(0, value).toFixed(2);
}

export function syntheticHistoryDocuments(now) {
  const end = new Date(now).getTime();
  const hours = 30 * 24;
  const documents = [];

  for (let hourIndex = hours; hourIndex >= 0; hourIndex -= 1) {
    const observedAt = new Date(end - hourIndex * 60 * 60 * 1000);
    const cycle = hours - hourIndex;

    for (let slot = 1; slot <= 24; slot += 1) {
      const values = {};
      const active = slot <= 12 && [1, 4, 7, 10].includes(slot);

      if (slot <= 12) {
        if (active) {
          const phase = cycle / 5 + slot / 3;
          const voltage = 12.2 + Math.sin(phase) * 0.12;
          const current = 5.5 + slot * 0.42 + Math.sin(phase * 0.7) * 1.4;
          const power = voltage * current;
          const accumulatedEnergy = 1.5 + cycle * 0.015 + slot * 0.02;

          values.U1 = fixed(voltage);
          values.U2 = '0.00';
          values.I1 = fixed(current);
          values.I2 = '0.00';
          values.P1 = fixed(power);
          values.P2 = '0.00';
          values.EP1 = fixed(accumulatedEnergy);
          values.EP2 = '0.00';
        } else {
          Object.assign(values, {
            U1: '0.00',
            U2: '0.00',
            I1: '0.00',
            I2: '0.00',
            P1: '0.00',
            P2: '0.00',
            EP1: '0.00',
            EP2: '0.00',
          });
        }
      }

      documents.push({
        entityId: ENTITY_ID,
        componentAddress: `0_1_${slot}`,
        observedAt,
        state: 'ONLINE',
        values,
        simulated: true,
      });
    }
  }

  return documents;
}

export function topologyDocuments(now) {
  const base = (id, parentId, name, kind) => ({
    id,
    parentId,
    name,
    kind,
    lifecycle: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  return [
    { ...base('demo-network', null, 'Synthetic Demo Network', 'NETWORK') },
    { ...base('demo-site', 'demo-network', 'Synthetic Demo Site', 'SITE') },
    { ...base('demo-structure', 'demo-site', 'Synthetic Demo Structure', 'STRUCTURE') },
    { ...base('demo-level', 'demo-structure', 'Synthetic Demo Level', 'LEVEL') },
    {
      ...base('demo-room', 'demo-level', 'Synthetic Demo Room', 'ROOM_SUBSTRUCTURE'),
      variant: 'ROOM',
    },
    {
      ...base('demo-bay', 'demo-room', 'Synthetic Demo Bay', 'CONTAINER_CLUSTER_BAY'),
      variant: 'BAY',
    },
    {
      ...base('demo-position', 'demo-bay', 'A1', 'POSITION'),
      coordinate: { row: 'A', column: 1 },
    },
    {
      ...base('demo-rack', 'demo-position', 'Synthetic Demo Rack', 'CONTAINER_RACK'),
      variant: 'RACK',
      totalU: 42,
      // Illustrative 6 U mount for this synthetic fixture, not a hardware dimension claim.
      cas: [
        { id: 'demo-cas-low', startU: 1, endU: 18, state: 'AVAILABLE' },
        {
          id: 'demo-cas-mounted',
          startU: 19,
          endU: 24,
          state: 'EQUIPPED',
          mountStartU: 19,
          physicalSizeU: 6,
          occupantId: ENTITY_ID,
          occupantKind: 'DEVICE',
        },
        { id: 'demo-cas-high', startU: 25, endU: 42, state: 'AVAILABLE' },
      ],
    },
    {
      ...base(ENTITY_ID, 'demo-rack', 'Synthetic QDF / BDFB', 'DEVICE'),
      serialNumber: SERIAL_NUMBER,
      category: 'QDF/BDFB DEMO',
      deviceType: 'QDF_BDFB',
      pinned: true,
      bdfb: {
        shelves: [
          {
            id: 'demo-shelf-1',
            label: 'Shelf 1',
            frames: [
              {
                id: 'demo-frame-1',
                label: 'Frame 1',
                presentation: { physicalFrameVisible: false },
                panels: [
                  {
                    id: 'demo-panel-1',
                    label: 'Panel 1',
                    endpoints: syntheticBreakers(),
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ];
}
