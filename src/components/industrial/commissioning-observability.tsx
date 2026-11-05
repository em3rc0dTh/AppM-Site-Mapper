'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

export interface CommissioningObservabilityData {
  generatedAt: string;
  mqttConnection: string;
  history: {
    enabled: boolean;
    status: 'HEALTHY' | 'DEGRADED' | 'DISABLED';
    lastWriteAt: string | null;
    failures: number;
  };
  sources: {
    protocol: 'MQTT' | 'SNMP';
    sourceIdentity: string;
    environment: 'LAB' | 'FIELD' | 'DECLARED';
    communication: 'LIVE' | 'STALE' | 'OFFLINE' | 'ERROR';
    lastSeenAt: string | null;
    bindingCount: number;
    targetCount: number;
    rawStatus: string;
  }[];
  bindings: {
    id: string;
    protocol: string;
    sourceIdentity: string;
    sourcePointId: string | null;
    metric: string;
    targetType: 'DEVICE' | 'EQUIPMENT' | 'ACCESS_PORT';
    targetId: string;
    targetLabel: string;
    commissioning: string | null;
    measurementSource: string | null;
  }[];
}

const cardStyle = {
  border: '1px solid #c8ced6',
  borderRadius: 8,
  padding: 12,
  minWidth: 0,
} as const;

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
} as const;

function time(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

export function CommissioningObservabilityPanel({
  data,
}: {
  data: CommissioningObservabilityData;
}) {
  const t = useTranslations('industrialCommissioning');
  const bindingsBySource = useMemo(() => {
    const map = new Map<string, CommissioningObservabilityData['bindings']>();
    for (const binding of data.bindings) {
      const key = binding.protocol + '|' + binding.sourceIdentity;
      const rows = map.get(key) ?? [];
      rows.push(binding);
      map.set(key, rows);
    }
    return map;
  }, [data.bindings]);

  return (
    <section
      style={{
        border: '1px solid #c8ced6',
        borderRadius: 12,
        padding: 18,
        display: 'grid',
        gap: 16,
      }}
      aria-label={t('s05_source_binding_status')}
    >
      <div>
        <h2 style={{ marginBottom: 6 }}>{t('s05_source_binding_status')}</h2>
        <p style={{ margin: 0 }}>{t('s05_source_binding_description')}</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        <div style={cardStyle}>
          <small>{t('s05_mqtt_runtime')}</small>
          <div>
            <strong>{data.mqttConnection.toUpperCase()}</strong>
          </div>
        </div>
        <div style={cardStyle}>
          <small>{t('s05_history')}</small>
          <div>
            <strong>{data.history.status}</strong>
          </div>
          <small>
            {t('s05_last_seen')}: {time(data.history.lastWriteAt, t('s05_unavailable'))}
          </small>
        </div>
        <div style={cardStyle}>
          <small>{t('s05_sources')}</small>
          <div>
            <strong>{data.sources.length}</strong>
          </div>
        </div>
        <div style={cardStyle}>
          <small>{t('s05_bindings')}</small>
          <div>
            <strong>{data.bindings.length}</strong>
          </div>
        </div>
      </div>

      {!data.sources.length ? (
        <p>{t('s05_no_sources')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6 }}>{t('s05_source')}</th>
                <th style={{ textAlign: 'left', padding: 6 }}>{t('s05_environment')}</th>
                <th style={{ textAlign: 'left', padding: 6 }}>{t('s05_status')}</th>
                <th style={{ textAlign: 'left', padding: 6 }}>{t('s05_last_seen')}</th>
                <th style={{ textAlign: 'right', padding: 6 }}>{t('s05_bindings')}</th>
                <th style={{ textAlign: 'right', padding: 6 }}>{t('s05_targets')}</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((source) => (
                <tr key={source.protocol + '|' + source.sourceIdentity}>
                  <td style={{ padding: 6 }}>
                    <strong>{source.protocol}</strong> · {source.sourceIdentity}
                  </td>
                  <td style={{ padding: 6 }}>{source.environment}</td>
                  <td style={{ padding: 6 }} title={source.rawStatus}>
                    {source.communication}
                  </td>
                  <td style={{ padding: 6 }}>{time(source.lastSeenAt, t('s05_unavailable'))}</td>
                  <td style={{ textAlign: 'right', padding: 6 }}>{source.bindingCount}</td>
                  <td style={{ textAlign: 'right', padding: 6 }}>{source.targetCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ marginBottom: 0 }}>{t('s05_binding_map')}</h3>
        {data.sources.map((source) => {
          const key = source.protocol + '|' + source.sourceIdentity;
          const rows = bindingsBySource.get(key) ?? [];
          return (
            <details key={key}>
              <summary>
                {source.protocol} · {source.sourceIdentity} · {rows.length} {t('s05_bindings')}
              </summary>
              <div style={{ overflowX: 'auto', paddingTop: 8 }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 6 }}>{t('s05_point')}</th>
                      <th style={{ textAlign: 'left', padding: 6 }}>{t('s05_metric')}</th>
                      <th style={{ textAlign: 'left', padding: 6 }}>{t('s05_target')}</th>
                      <th style={{ textAlign: 'left', padding: 6 }}>{t('s05_commissioning')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((binding) => (
                      <tr key={binding.id}>
                        <td style={{ padding: 6 }}>{binding.sourcePointId ?? 'SOURCE'}</td>
                        <td style={{ padding: 6 }}>{binding.metric}</td>
                        <td style={{ padding: 6 }}>
                          {binding.targetLabel} · {binding.targetType}
                        </td>
                        <td style={{ padding: 6 }}>
                          {binding.commissioning ??
                            binding.measurementSource ??
                            t('s05_unavailable')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>

      <small>
        {t('s05_generated_at')}: {time(data.generatedAt, data.generatedAt)}
      </small>
    </section>
  );
}
