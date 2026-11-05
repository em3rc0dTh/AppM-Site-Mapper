import { describe, expect, it } from 'vitest';

import { composeCommissioningObservability } from '@/modules/industrial/application/commissioning-observability';
import type { CommunicationProfile } from '@/modules/industrial/domain/commissioning';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import type { TelemetryDiagnostics } from '@/modules/telemetry/infrastructure/telemetry-runtime';

const profile = (overrides: Partial<CommunicationProfile> = {}): CommunicationProfile => ({
  equipmentId: 'gw',
  bdfbDeviceId: 'qdf',
  role: 'GATEWAY',
  recordStatus: 'FIELD_VERIFIED',
  sourceIdentity: 'GW-SERIAL',
  network: {
    ip: '192.0.2.10',
    mask: '255.255.255.0',
    gateway: '192.0.2.1',
    services: [{ protocol: 'MQTT' }],
  },
  rs485: { baudRate: 9600, dataBits: 8, parity: 'NONE', stopBits: 1 },
  evidence: { projectId: 'test', documentName: 'test', revision: '1' },
  revisionNumber: 1,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
  updatedBy: 'tester',
  history: [],
  ...overrides,
});

const binding = (overrides: Partial<TelemetryBinding> = {}): TelemetryBinding => ({
  id: 'binding',
  lifecycle: 'ACTIVE',
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
  protocol: 'MQTT',
  sourceIdentity: 'GW-SERIAL',
  sourcePointId: '0_1_1',
  metric: 'CURRENT',
  targetType: 'EQUIPMENT',
  targetId: 'breaker',
  ...overrides,
});

const diagnostics = (overrides: Partial<TelemetryDiagnostics> = {}): TelemetryDiagnostics => ({
  enabled: true,
  connection: 'subscribed',
  topicFilter: 'office/dev/#',
  lastSubscribedAt: '2026-11-05T10:00:00.000Z',
  lastConnectionError: null,
  capture: {
    state: 'DURABLE_SPOOL',
    failures: 0,
    lastFailureAt: null,
    guarantee: 'test',
  },
  rawMessages: 1,
  acceptedMessages: 1,
  rejectedMessages: 0,
  lastRawAt: '2026-11-05T10:00:05.000Z',
  lastAcceptedAt: '2026-11-05T10:00:05.000Z',
  rejectionReasons: {},
  sources: [
    {
      serial: 'GW-SERIAL',
      rawMessages: 1,
      lastRawAt: '2026-11-05T10:00:05.000Z',
      mappedDeviceId: 'qdf',
      mappedTargetId: 'qdf',
      mappedTargetType: 'DEVICE',
      pointCount: 1,
      mappedBreakerCount: 1,
      unmappedPointCount: 0,
      freshness: 'LIVE',
    },
  ],
  history: {
    enabled: true,
    writes: 1,
    rowsAccepted: 1,
    failures: 0,
    lastWriteAt: '2026-11-05T10:00:05.000Z',
    lastError: null,
  },
  ...overrides,
});

const snmpLoad = (feeds: SnmpBdfbLoadView['feeds']): SnmpBdfbLoadView => ({
  deviceId: 'qdf',
  hardwareProfile: null,
  inventoryStatus: 'NOT_APPLICABLE',
  expectedFeedCount: feeds.length,
  missingFeedPositions: [],
  configurationIssues: [],
  status: 'PARTIAL',
  totalCurrentA: null,
  measuredCurrentA: null,
  totalRatedCurrentA: null,
  totalEstimatedPowerW: null,
  feedCount: feeds.length,
  freshFeedCount: feeds.filter((feed) => feed.status === 'LIVE').length,
  labFreshFeedCount: feeds.filter((feed) => feed.status === 'LAB_LIVE').length,
  labMeasuredCurrentA: null,
  feeds,
});

describe('S05 commissioning observability', () => {
  it('reports FIELD MQTT source health and a sanitized binding map', () => {
    const result = composeCommissioningObservability({
      profiles: [profile()],
      bindings: [binding()],
      targetLabels: new Map([['breaker', 'A3-01']]),
      fieldVerifiedAccessPortIds: new Set(),
      mqtt: diagnostics(),
      snmp: null,
      now: '2026-11-05T10:00:10.000Z',
    });

    expect(result.sources).toEqual([
      expect.objectContaining({
        protocol: 'MQTT',
        sourceIdentity: 'GW-SERIAL',
        environment: 'FIELD',
        communication: 'LIVE',
        lastSeenAt: '2026-11-05T10:00:05.000Z',
        bindingCount: 1,
        targetCount: 1,
      }),
    ]);
    expect(result.bindings).toEqual([
      expect.objectContaining({
        sourcePointId: '0_1_1',
        metric: 'CURRENT',
        targetLabel: 'A3-01',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('credentialRef');
  });

  it('recognizes the existing TELXIUS synthetic MQTT marker as LAB', () => {
    const result = composeCommissioningObservability({
      profiles: [profile({ recordStatus: 'DECLARED' })],
      bindings: [
        binding({
          attributes: {
            commissioning: 'SEED_01_SYNTHETIC_LAB_V1',
            synthetic: true,
            labProfile: 'TELXIUS_SEED_01',
          },
        }),
      ],
      targetLabels: new Map([['breaker', 'A3-01']]),
      fieldVerifiedAccessPortIds: new Set(),
      mqtt: diagnostics(),
      snmp: null,
    });

    expect(result.sources[0]).toMatchObject({
      protocol: 'MQTT',
      sourceIdentity: 'GW-SERIAL',
      environment: 'LAB',
      communication: 'LIVE',
    });
  });

  it('keeps synthetic SNMP explicitly LAB and normalizes LAB_LIVE to LIVE communication', () => {
    const snmpBinding = binding({
      id: 'snmp-current',
      protocol: 'SNMP',
      sourceIdentity: 'EMU-DELTA-BFDB-01',
      sourcePointId: '1.3.6.1.4.1.999.1',
      targetType: 'ACCESS_PORT',
      targetId: 'feed-a',
      attributes: { commissioning: 'SYNTHETIC_LAB_ONLY' },
    });
    const load = snmpLoad([
      {
        accessPortId: 'feed-a',
        label: 'Input A',
        side: 'A',
        feedPosition: 'A',
        overloadThresholdA: null,
        overloadWarning: null,
        ratedCurrentA: null,
        status: 'LAB_LIVE',
        currentA: 10,
        voltageV: -53,
        observedAt: '2026-11-05T10:00:06.000Z',
        sourceIdentity: 'EMU-DELTA-BFDB-01',
        currentOid: '1.3.6.1.4.1.999.1',
        utilizationPct: null,
        estimatedPowerW: 530,
        servedPanelIds: [],
      },
    ]);

    const result = composeCommissioningObservability({
      profiles: [],
      bindings: [snmpBinding],
      targetLabels: new Map([['feed-a', 'Controller / Input A']]),
      fieldVerifiedAccessPortIds: new Set(),
      mqtt: diagnostics({ sources: [] }),
      snmp: load,
    });

    expect(result.sources[0]).toMatchObject({
      protocol: 'SNMP',
      environment: 'LAB',
      communication: 'LIVE',
      rawStatus: 'LAB_LIVE',
    });
  });

  it('reports partial/stale SNMP and degraded history without inventing field verification', () => {
    const bindings = [
      binding({
        id: 'snmp-a',
        protocol: 'SNMP',
        sourceIdentity: 'CTRL',
        targetType: 'ACCESS_PORT',
        targetId: 'a',
        attributes: {},
      }),
      binding({
        id: 'snmp-b',
        protocol: 'SNMP',
        sourceIdentity: 'CTRL',
        targetType: 'ACCESS_PORT',
        targetId: 'b',
        attributes: {},
      }),
    ];
    const load = snmpLoad([
      {
        accessPortId: 'a',
        label: 'A',
        side: 'A',
        feedPosition: 'A',
        overloadThresholdA: null,
        overloadWarning: null,
        ratedCurrentA: null,
        status: 'LIVE',
        currentA: 10,
        voltageV: -53,
        observedAt: '2026-11-05T10:00:06.000Z',
        sourceIdentity: 'CTRL',
        currentOid: '1.3.6.1.4.1.999.1',
        utilizationPct: null,
        estimatedPowerW: 530,
        servedPanelIds: [],
      },
      {
        accessPortId: 'b',
        label: 'B',
        side: 'B',
        feedPosition: 'B',
        overloadThresholdA: null,
        overloadWarning: null,
        ratedCurrentA: null,
        status: 'STALE',
        currentA: null,
        voltageV: null,
        observedAt: '2026-11-05T09:50:00.000Z',
        sourceIdentity: 'CTRL',
        currentOid: '1.3.6.1.4.1.999.2',
        utilizationPct: null,
        estimatedPowerW: null,
        servedPanelIds: [],
      },
    ]);

    const result = composeCommissioningObservability({
      profiles: [],
      bindings,
      targetLabels: new Map(),
      fieldVerifiedAccessPortIds: new Set(['a']),
      mqtt: diagnostics({
        history: {
          enabled: true,
          writes: 1,
          rowsAccepted: 1,
          failures: 1,
          lastWriteAt: '2026-11-05T10:00:05.000Z',
          lastError: 'STORE_UNAVAILABLE',
        },
      }),
      snmp: load,
    });

    expect(result.sources[0]).toMatchObject({
      environment: 'DECLARED',
      communication: 'STALE',
    });
    expect(result.history.status).toBe('DEGRADED');
  });
});
