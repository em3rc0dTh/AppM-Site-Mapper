'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';
import { projectSnmpCapacity } from '@/modules/telemetry/application/snmp-capacity-projection';

interface Props {
  readonly root: EquipmentNode;
  readonly byId: ReadonlyMap<string, EquipmentNode>;
}

function quantity(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} A`;
}

export function SnmpCapacityStrip({ root, byId }: Props) {
  const t = useTranslations('snmpStrip');
  const [load, setLoad] = useState<SnmpBdfbLoadView | null>(null);
  const [error, setError] = useState(false);
  const panels = useMemo(() => {
    const ids = new Set<string>();
    const visited = new Set<string>();
    function visit(node: EquipmentNode) {
      if (node.lifecycle !== 'ACTIVE' || visited.has(node.id)) return;
      visited.add(node.id);
      if (node.equipmentType === 'PANEL') ids.add(node.id);
      node.children.forEach((id) => {
        const child = id ? byId.get(id) : undefined;
        if (child && child.deviceId === root.deviceId) visit(child);
      });
    }
    visit(root);
    return ids;
  }, [root, byId]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch(
          `/api/telemetry/snmp/feeds?deviceId=${encodeURIComponent(root.deviceId)}`,
          { cache: 'no-store' },
        );
        if (!response.ok) throw new Error('SNMP_FEEDS_UNAVAILABLE');
        const data = (await response.json()) as SnmpBdfbLoadView;
        if (active) {
          setLoad(data);
          setError(false);
        }
      } catch {
        if (active) {
          setLoad(null);
          setError(true);
        }
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [root.deviceId]);

  if (error || !load || !load.feeds.length) return null;
  const scopedFeeds =
    root.equipmentType === 'CHASSIS'
      ? load.feeds
      : load.feeds.filter((feed) => feed.servedPanelIds.some((id) => panels.has(id)));
  if (!scopedFeeds.length) return null;

  const chassis = root.equipmentType === 'CHASSIS';
  const shared =
    !chassis && scopedFeeds.some((feed) => feed.servedPanelIds.some((id) => !panels.has(id)));
  const scopeCapacity = projectSnmpCapacity(
    load,
    scopedFeeds,
    chassis ? load.expectedFeedCount : scopedFeeds.length,
  );
  // A current measured by a shared feeder belongs to the whole feeder, not
  // to an arbitrary subset of the panels it serves.
  const exclusive = chassis || !shared;
  const rated = exclusive ? scopeCapacity.ratedA : null;
  const used = exclusive ? scopeCapacity.measuredA : null;
  const available = exclusive ? scopeCapacity.availableA : null;
  const ratio = exclusive ? scopeCapacity.utilizationPct : null;
  const simulated = scopeCapacity.mode === 'LAB_SIMULATED';
  return (
    <section className="ec-snmp-capacity" aria-label={t('label')}>
      <header>
        <div>
          <strong>{t('title')}</strong>
          <small>
            {chassis
              ? t('chassisShunts')
              : t('scopedFeeds')}
          </small>
        </div>
        <span>
          {simulated
            ? t('labSimulated')
            : scopeCapacity.mode === 'VERIFIED_LIVE' && ratio !== null
              ? t('verifiedLive')
              : t('incompleteShared')}
        </span>
      </header>
      <div className="ec-snmp-capacity-metrics">
        <div>
          <small>{t('measured')}</small>
          <strong>{quantity(used)}</strong>
        </div>
        <div>
          <small>{t('rated')}</small>
          <strong>{quantity(rated)}</strong>
        </div>
        <div>
          <small>{t('available')}</small>
          <strong>{quantity(available)}</strong>
        </div>
      </div>
      {ratio !== null && (
        <div
          className="ec-snmp-utilization"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, ratio))}
          aria-label={
            simulated ? t('simulatedCapacityUsed') : t('verifiedCapacityUsed')
          }
        >
          <div style={{ width: `${Math.min(100, Math.max(0, ratio))}%` }} />
          <span>
            {t('utilization', { percent: ratio.toFixed(1), available: quantity(available) })}{' '}
            {simulated ? t('labSimulated') : t('verified')}
          </span>
        </div>
      )}
      <div className="ec-snmp-feed-tags">
        {scopeCapacity.feedUtilization.map((feed) => {
          const original = scopedFeeds.find(
            (candidate) => candidate.accessPortId === feed.accessPortId,
          );
          return (
            <span key={feed.accessPortId}>
              <strong>{feed.label}</strong>: {quantity(feed.measuredA)} / {quantity(feed.ratedA)}
              {feed.utilizationPct !== null
                ? t('feedUtilization', { percent: feed.utilizationPct.toFixed(1), available: quantity(feed.availableA) })
                : t('noRatedReading')}
              {' · '}
              {feed.status === 'LAB_LIVE' ? t('labSimulated') : feed.status === 'LIVE' ? t('verifiedLive') : feed.status === 'STALE' ? t('stale') : feed.status === 'UNMAPPED' ? t('unmapped') : feed.status === 'NO_DATA' ? t('noData') : feed.status === 'CONFLICT' ? t('conflict') : t('unverified')}
              {(original?.servedPanelIds.length ?? 0) > 1 ? t('sharedShunt') : ''}
            </span>
          );
        })}
      </div>
      {(simulated || shared || !exclusive) && (
        <p>
          {simulated
            ? t('simulationWarning')
            : ''}
          {shared
            ? t('sharedWarning')
            : ''}
          {!exclusive
            ? t('partialWarning')
            : ratio === null
              ? t('incompleteWarning')
              : ''}
        </p>
      )}
    </section>
  );
}
