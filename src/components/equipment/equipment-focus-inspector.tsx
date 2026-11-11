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
import { useTranslations } from 'next-intl';
import { AlarmOccurrenceList, AlarmScopeSummary } from '@/components/alarm/alarm-scope-summary';
import { DetachedWorkbenchButton } from '@/components/workbench/detached-workbench-button';

type Tab = 'overview' | 'telemetry' | 'history' | 'alarms' | 'ports' | 'settings';

const OPERATION_TABS: readonly Tab[] = ['overview', 'telemetry', 'history', 'alarms'];
const MAINTENANCE_TABS: readonly Tab[] = ['ports', 'settings'];

const METRICS = [
  { key: 'voltageV', symbol: 'V', unit: 'V', digits: 2, scale: 1 },
  { key: 'currentA', symbol: 'I', unit: 'A', digits: 2, scale: 1 },
  { key: 'powerW', symbol: 'P', unit: 'kW', digits: 3, scale: 0.001 },
  { key: 'energyKwh', symbol: 'E', unit: 'kWh', digits: 4, scale: 1 },
] as const;

interface Props {
  readonly equipment: EquipmentNode;
  readonly familyEquipment: readonly EquipmentNode[];
  readonly bindings: readonly CompositionBreakerBinding[];
  readonly canReadTelemetry: boolean;
  readonly overview: ReactNode;
  readonly ports: ReactNode;
  readonly settings: ReactNode;
  readonly mode?: 'operation' | 'maintenance';
}

export function EquipmentFocusInspector({
  equipment,
  familyEquipment,
  bindings,
  canReadTelemetry,
  overview,
  ports,
  settings,
  mode = 'operation',
}: Props) {
  const t = useTranslations('equipment.inspector');
  const tw = useTranslations('workbench');
  const [tab, setTab] = useState<Tab>(mode === 'maintenance' ? 'ports' : 'overview');
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
  const declaredTarget = breaker
    ? equipment.aliases?.find((alias) => alias.trim().length > 0)
    : undefined;
  const current = breaker ? readings[equipment.id] : undefined;
  const tabs = mode === 'maintenance' ? MAINTENANCE_TABS : OPERATION_TABS;
  const visibleTabs = canReadTelemetry ? tabs : tabs.filter((key) => key !== 'telemetry' && key !== 'history');
  const activeTab = tab === 'telemetry' && !canReadTelemetry ? 'overview' : tab;
  const coverage = breaker
    ? t('coverageBreaker', { reporting: summary.reporting })
    : equipment.equipmentType === 'PANEL'
      ? t('coveragePanel', {
          reporting: summary.reporting,
          positions: summary.positions,
          installed: summary.installed,
        })
      : t('coverageChildren', {
          reporting: summary.reportingChildren,
          installed: summary.installedChildren,
          breakers: summary.reporting,
        });

  return (
    <section className="ec-inspector" aria-label={equipment.name + ' ' + t('inspectorLabel')}>
      <div className="zip-device-identity">
        <span aria-hidden="true">▥</span>
        <div>
          <h2>{equipment.name}</h2>
          <small>{equipment.equipmentType.replaceAll('_', ' ')}</small>
        </div>
      </div>

      {declaredTarget ? (
        <div
          className="ec-inspector-note"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            border: '1px solid #d7e2ef',
            borderRadius: 8,
            background: '#f8fbff',
          }}
        >
          <small style={{ display: 'block', marginBottom: 4 }}>{t('declaredPowerTarget')}</small>
          <strong>{declaredTarget}</strong>
        </div>
      ) : null}

      {canReadTelemetry && (
        <p className="ec-scope-readiness">
          <span className="ec-status-dot" aria-hidden="true" />
          {coverage}
        </p>
      )}
      <div className="ec-inspector-tabs" role="tablist" aria-label={t('tabsLabel')}>
        {visibleTabs.map((key) => (
          <button
            key={key}
            id={`ec-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            aria-controls={`ec-tabpanel-${key}`}
            onClick={() => setTab(key)}
          >
            {key === 'overview' ? t('overview') : key === 'telemetry' ? t('inputs') : key === 'history' ? t('charts') : key === 'alarms' ? t('alarms') : key === 'ports' ? t('ports') : t('settings')}
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
              {breaker ? t('ownReading') : t('descendantReading')}
            </div>
            {!canReadTelemetry ? (
              <p className="ec-inspector-note">{t('roleDenied')}</p>
            ) : (
              <>
                <p className="ec-inspector-counts">
                  {coverage}
                  {summary.stale > 0 ? t('stale', { count: summary.stale }) : ''}
                </p>
                {equipment.telemetryPointPrefix && (
                  <p className="ec-inspector-note">
                    {t('pointGroup', { name: equipment.telemetryPointPrefix })}
                  </p>
                )}
                <div className="ec-inspector-metrics" aria-label={t('metricsLabel')}>
                  {METRICS.map((metric) => {
                    const value = breaker ? current?.[metric.key] : summary.metrics[metric.key];
                    return (
                      <div className="ec-inspector-metric" key={metric.key}>
                        <small>
                          {metric.symbol} · {t(`metric.${metric.key}`)}
                        </small>
                        <strong>
                          {value === undefined
                            ? '—'
                            : (value * metric.scale).toFixed(metric.digits)}
                        </strong>
                        <span>{metric.unit}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="ec-inspector-note">
                  {breaker
                    ? t('sourcePacket', {
                        identity: current?.sourceIdentity ?? t('noBinding'),
                        timestamp: current?.receivedAt ?? '—',
                      })
                    : t('hierarchy')}
                </p>
                {!hasSnapshot && (
                  <p className="ec-inspector-note" role="status">
                    {t('waiting')}
                  </p>
                )}
              </>
            )}
          </>
        )}
        {activeTab === 'alarms' && (
          <>
            <AlarmScopeSummary
              entityId={equipment.id}
              scopeLabel={equipment.name}
              showAffectedChildren
            />
            <AlarmOccurrenceList entityId={equipment.id} />
          </>
        )}
        {activeTab === 'overview' && (
          <>
            <AlarmScopeSummary entityId={equipment.id} scopeLabel={equipment.name} />
            {overview}
            {equipment.telemetryPointPrefix && (
              <p className="ec-inspector-note ec-point-group">
                {t('configuredGroup', { name: equipment.telemetryPointPrefix })}
              </p>
            )}
          </>
        )}
        {activeTab === 'history' && canReadTelemetry && (
          <>
            <CompositionHistoryCharts equipmentId={equipment.id} equipmentType={equipment.equipmentType} />
            {breaker && (
              <div className="sm-detached-workbench-actions">
                <DetachedWorkbenchButton
                  href={`/workbench/breaker-report?equipmentId=${encodeURIComponent(equipment.id)}&window=24h`}
                  windowName={`site-mapper-breaker-report-${equipment.id}`}
                  label={tw('openBreakerReport')}
                />
              </div>
            )}
            {breaker && (
              <details className="ec-history-raw">
                <summary>{t('packets')}</summary>
                <EquipmentTelemetryInspector targetId={equipment.id} label={equipment.name} />
              </details>
            )}
          </>
        )}
        {activeTab === 'ports' && ports}
        {activeTab === 'settings' && settings}
      </div>

      {mode === 'maintenance' && equipment.equipmentType === 'CHASSIS' && canReadTelemetry && (
        <div className="ec-snmp-source">
          <p className="ec-inspector-note">{t('snmpSeparation')}</p>
          <button
            type="button"
            aria-expanded={snmpExpanded}
            onClick={() => setSnmpExpanded((value) => !value)}
          >
            {snmpExpanded ? t('hideSnmp') : t('showSnmp')}
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
