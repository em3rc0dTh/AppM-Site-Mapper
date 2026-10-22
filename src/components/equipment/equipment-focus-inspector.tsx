'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { EquipmentTelemetryInspector } from '@/components/telemetry/equipment-telemetry-inspector';
import { CompositionHistoryCharts } from './composition-history-charts';
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
  const [tab, setTab] = useState<Tab>('overview');
  const [snmpExpanded, setSnmpExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const hasLiveReadings = canReadTelemetry && summary.reporting > 0;
  const visibleTabs = hasLiveReadings ? TABS : TABS.filter(({ key }) => key !== 'telemetry');
  const activeTab = tab === 'telemetry' && !hasLiveReadings ? 'overview' : tab;
  const coverage =
    breaker ? `${summary.reporting}/1 breaker LIVE` :
    equipment.equipmentType === 'PANEL' ?
      `${summary.reporting}/${summary.positions} positions with MQTT LIVE · ${summary.installed} installed` :
      `${summary.reportingChildren}/${summary.installedChildren} immediate children with MQTT LIVE · ${summary.reporting} live breakers below`;

  return (
    <section className="ec-inspector" aria-label={equipment.name + ' Equipment inspector'}>
      <div className="zip-device-identity">
        <span aria-hidden="true">▥</span>
        <div>
          <h2>{equipment.name}</h2>
          <small>{equipment.equipmentType.replaceAll('_', ' ')}</small>
        </div>
      </div>

      {canReadTelemetry && (
        <p className="ec-scope-readiness">
          <span className="ec-status-dot" aria-hidden="true" />
          {coverage}
        </p>
      )}
      <div className="ec-inspector-tabs" role="tablist" aria-label="Equipment inspector tabs">
        {visibleTabs.map(({ key, label }) => (
          <button
            key={key}
            id={`ec-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
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
        id={`ec-tabpanel-${activeTab}`}
        aria-labelledby={`ec-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === 'telemetry' && (
          <>
            <div className="ec-inspector-section-title">
              {breaker ? 'MQTT · own breaker reading' : 'MQTT · reporting descendant breakers'}
            </div>
            {!canReadTelemetry ? (
              <p className="ec-inspector-note">Your role does not allow telemetry access.</p>
            ) : (
              <>
                <p className="ec-inspector-counts">
                  {coverage}
                  {summary.stale > 0 ? ` · ${summary.stale} stale` : ''}
                </p>
                {equipment.telemetryPointPrefix && (
                  <p className="ec-inspector-note">Point group {equipment.telemetryPointPrefix}</p>
                )}
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
                    : 'Hierarchical arithmetic mean of reporting immediate-child means. Missing metrics and empty slots are excluded. These are not SNMP input totals.'}
                </p>
                {!hasSnapshot && (
                  <p className="ec-inspector-note" role="status">
                    Waiting for telemetry stream snapshot…
                  </p>
                )}
              </>
            )}
          </>
        )}
        {activeTab === 'overview' && (
          <>
            {overview}
            {equipment.telemetryPointPrefix && (
              <p className="ec-inspector-note ec-point-group">
                Point group {equipment.telemetryPointPrefix} · configured, not a live reading
              </p>
            )}
          </>
        )}
        {activeTab === 'ports' && ports}
        {activeTab === 'settings' && settings}
      </div>
      {canReadTelemetry && (
        <details
          className="ec-inspector-history ec-composition-history"
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary>History &amp; diagnostics · charts</summary>
          {historyOpen && (
            <>
              <CompositionHistoryCharts
                equipmentId={equipment.id}
                equipmentType={equipment.equipmentType}
              />
              {breaker && (
                <details className="ec-history-raw">
                  <summary>Inspect original breaker packets</summary>
                  <EquipmentTelemetryInspector targetId={equipment.id} label={equipment.name} />
                </details>
              )}
            </>
          )}
        </details>
      )}
      {equipment.equipmentType === 'CHASSIS' && canReadTelemetry && (
        <div className="ec-snmp-source">
          <p className="ec-inspector-note">
            SNMP incoming DC shunts are independent from MQTT breaker readings.
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
    </section>
  );
}
