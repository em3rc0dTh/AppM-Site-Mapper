'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { EquipmentTelemetryInspector } from '@/components/telemetry/equipment-telemetry-inspector';
import { SnmpFeedLoadPanel } from '@/components/power/snmp-feed-load-panel';
import { useTelemetryStream } from '@/components/telemetry/use-bdfb-telemetry';
import { projectCompositionTelemetry } from '@/modules/telemetry/application/composition-telemetry-summary';
import {
  compositionBreakerTelemetry,
  type CompositionBreakerBinding,
  type CompositionBreakerTelemetry,
} from '@/modules/telemetry/domain/composition-breaker-telemetry';
import type { EquipmentNode } from '@/modules/topology/domain/entities';

type Tab = 'telemetry' | 'overview' | 'ports' | 'settings';

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'telemetry', label: 'Telemetría' },
  { key: 'overview', label: 'Resumen' },
  { key: 'ports', label: 'Puertos' },
  { key: 'settings', label: 'Config.' },
];

const METRICS = [
  { key: 'voltageV', symbol: 'V', label: 'Voltage', unit: 'V', digits: 2 },
  { key: 'currentA', symbol: 'I', label: 'Current', unit: 'A', digits: 2 },
  { key: 'powerW', symbol: 'P', label: 'Power', unit: 'W', digits: 2 },
  { key: 'energyKwh', symbol: 'E', label: 'Energy counter', unit: 'kWh', digits: 4 },
] as const;

interface Props {
  readonly equipment: EquipmentNode;
  readonly familyEquipment: readonly EquipmentNode[];
  readonly bindings: readonly CompositionBreakerBinding[];
  readonly canReadTelemetry: boolean;
  readonly overview: ReactNode;
  readonly ports: ReactNode;
  readonly settings: ReactNode;
}

export function EquipmentFocusInspector({
  equipment,
  familyEquipment,
  bindings,
  canReadTelemetry,
  overview,
  ports,
  settings,
}: Props) {
  const [tab, setTab] = useState<Tab>('telemetry');
  const [snmpExpanded, setSnmpExpanded] = useState(false);
  const { samples, now, hasSnapshot } = useTelemetryStream(canReadTelemetry);
  const equipmentById = useMemo(
    () => new Map(familyEquipment.map((item) => [item.id, item])),
    [familyEquipment],
  );
  const readings = useMemo(
    () =>
      Object.fromEntries(
        familyEquipment
          .filter((item) => item.lifecycle === 'ACTIVE' && item.equipmentType === 'CIRCUIT_BREAKER')
          .map((item) => [
            item.id,
            canReadTelemetry
              ? compositionBreakerTelemetry(item.id, item.deviceId, samples, bindings, now)
              : ({ status: 'NO DATA' } as CompositionBreakerTelemetry),
          ]),
      ) as Readonly<Record<string, CompositionBreakerTelemetry>>,
    [familyEquipment, samples, bindings, canReadTelemetry, now],
  );
  const summary = projectCompositionTelemetry(equipment, equipmentById, readings);
  const breaker = equipment.equipmentType === 'CIRCUIT_BREAKER';
  const current = breaker ? readings[equipment.id] : undefined;

  return (
    <section className="ec-inspector" aria-label={equipment.name + ' Equipment inspector'}>
      <div className="zip-device-identity">
        <span aria-hidden="true">▥</span>
        <div>
          <h2>{equipment.name}</h2>
          <small>{equipment.equipmentType.replaceAll('_', ' ')}</small>
        </div>
      </div>

      <div className="ec-inspector-tabs" role="tablist" aria-label="Equipment inspector tabs">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            id={`ec-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`ec-tabpanel-${key}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="ec-inspector-tab-body"
        role="tabpanel"
        id={`ec-tabpanel-${tab}`}
        aria-labelledby={`ec-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'telemetry' && (
          <>
            <div className="ec-inspector-section-title">
              {breaker ? 'MQTT · own breaker reading' : 'MQTT · reporting descendant breakers'}
            </div>
            {!canReadTelemetry ? (
              <p className="ec-inspector-note">Your role does not allow telemetry access.</p>
            ) : (
              <>
                <p className="ec-inspector-counts">
                  {breaker ? (
                    <>Binding status: {current?.status ?? 'UNMAPPED'}</>
                  ) : (
                    <>
                      {summary.installed} installed · {summary.bound} bound · {summary.reporting}{' '}
                      reporting
                      {summary.stale > 0 ? ` · ${summary.stale} stale` : ''}
                    </>
                  )}
                </p>
                <div className="ec-inspector-metrics" aria-label="Live electrical measurements">
                  {METRICS.map((metric) => {
                    const value = breaker ? current?.[metric.key] : summary.metrics[metric.key];
                    return (
                      <div className="ec-inspector-metric" key={metric.key}>
                        <small>
                          {metric.symbol} · {metric.label}
                        </small>
                        <strong>{value === undefined ? '—' : value.toFixed(metric.digits)}</strong>
                        <span>{metric.unit}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="ec-inspector-note">
                  {breaker
                    ? `Source: ${current?.sourceIdentity ?? 'No verified MQTT binding'} · Last packet: ${current?.receivedAt ?? '—'}`
                    : 'Arithmetic mean of each metric from fresh, explicitly bound breakers. Missing values are excluded per metric; these are not feed totals.'}
                </p>
                {equipment.equipmentType === 'CHASSIS' && (
                  <div className="ec-snmp-source">
                    <p className="ec-inspector-note">
                      SNMP incoming DC shunts are a separate source. Simulated readings are never
                      mixed with MQTT figures or treated as certified totals.
                    </p>
                    <button
                      type="button"
                      aria-expanded={snmpExpanded}
                      onClick={() => setSnmpExpanded((value) => !value)}
                    >
                      {snmpExpanded ? 'HIDE SNMP FEEDS' : 'INSPECT SNMP FEEDS'}
                    </button>
                    {snmpExpanded && (
                      <SnmpFeedLoadPanel
                        deviceId={equipment.deviceId}
                        chassisId={equipment.id}
                        view="summary"
                      />
                    )}
                  </div>
                )}
                {!hasSnapshot && (
                  <p className="ec-inspector-note" role="status">
                    Waiting for telemetry stream snapshot…
                  </p>
                )}
                <details className="ec-inspector-history">
                  <summary>History &amp; diagnostics</summary>
                  <EquipmentTelemetryInspector
                    targetId={equipment.id}
                    label={equipment.name}
                    {...(equipment.telemetryPointPrefix
                      ? {
                          pointPrefix: equipment.telemetryPointPrefix,
                          pointCapacity:
                            equipment.childMode === 'POSITIONAL'
                              ? equipment.children.length
                              : undefined,
                        }
                      : {})}
                  />
                </details>
              </>
            )}
          </>
        )}
        {tab === 'overview' && overview}
        {tab === 'ports' && ports}
        {tab === 'settings' && settings}
      </div>
    </section>
  );
}
