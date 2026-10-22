'use client';

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
    !chassis && scopedFeeds.some((feed) =>
      feed.servedPanelIds.some((id) => !panels.has(id)));
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
    <section className="ec-snmp-capacity" aria-label="SNMP incoming DC feeder capacity">
      <header>
        <div>
          <strong>SNMP · DC input capacity</strong>
          <small>
            {chassis
              ? 'BDFB incoming independent shunts'
              : 'Recorded feeds serving this physical scope'}
          </small>
        </div>
        <span>
          {simulated ? 'LAB SIMULATED' : scopeCapacity.mode === 'VERIFIED_LIVE' && ratio !== null ? 'VERIFIED LIVE' : 'INCOMPLETE / SHARED'}
        </span>
      </header>
      <div className="ec-snmp-capacity-metrics">
        <div>
          <small>Measured current</small>
          <strong>{quantity(used)}</strong>
        </div>
        <div>
          <small>Rated current</small>
          <strong>{quantity(rated)}</strong>
        </div>
        <div>
          <small>Available capacity</small>
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
          aria-label={simulated ? 'Simulated DC feeder capacity used' : 'Verified DC feeder capacity used'}
        >
          <div style={{ width: `${Math.min(100, Math.max(0, ratio))}%` }} />
          <span>
            {ratio.toFixed(1)}% used · {quantity(available)} remaining · {simulated ? 'LAB SIMULATED' : 'VERIFIED'}
          </span>
        </div>
      )}
      <div className="ec-snmp-feed-tags">
        {scopeCapacity.feedUtilization.map((feed) => {
          const original = scopedFeeds.find((candidate) => candidate.accessPortId === feed.accessPortId);
          return (
            <span key={feed.accessPortId}>
              <strong>{feed.label}</strong>: {quantity(feed.measuredA)} / {quantity(feed.ratedA)}
              {feed.utilizationPct !== null
                ? ` · ${feed.utilizationPct.toFixed(1)}% used · ${quantity(feed.availableA)} free`
                : ' · no rated capacity or fresh reading'}
              {' · '}{feed.status === 'LAB_LIVE' ? 'LAB SIMULATED' : feed.status}
              {(original?.servedPanelIds.length ?? 0) > 1 ? ' · shared shunt' : ''}
            </span>
          );
        })}
      </div>
      {(simulated || shared || !exclusive) && (
        <p>
          {simulated ? 'LAB SIMULATED: computed capacity is an estimate from synthetic current and configured port ratings, never a certified physical limit. ' : ''}
          {shared
            ? 'A shunt serves multiple panels: its current is not attributed separately to each. '
            : ''}
          {!exclusive
            ? 'Current cannot be attributed to a partial group of panels served by the same shunt.'
            : ratio === null
              ? 'The full utilization is unavailable until all inputs report fresh current and have recorded nominal ampere ratings.'
              : ''}
        </p>
      )}
    </section>
  );
}
