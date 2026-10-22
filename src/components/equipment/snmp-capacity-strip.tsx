'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';

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
        const data = await response.json() as SnmpBdfbLoadView;
        if (active) { setLoad(data); setError(false); }
      } catch {
        if (active) { setLoad(null); setError(true); }
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { active = false; clearInterval(timer); };
  }, [root.deviceId]);

  if (error || !load || !load.feeds.length) return null;
  const scopedFeeds = root.equipmentType === 'CHASSIS'
    ? load.feeds
    : load.feeds.filter((feed) => feed.servedPanelIds.some((id) => panels.has(id)));
  if (!scopedFeeds.length) return null;

  const chassis = root.equipmentType === 'CHASSIS';
  const totalCertified = chassis && load.status === 'COMPLETE' &&
    load.totalRatedCurrentA !== null && load.totalCurrentA !== null;
  const fullyCovered = !chassis && scopedFeeds.every((feed) =>
    feed.status === 'LIVE' && feed.ratedCurrentA !== null &&
    feed.servedPanelIds.length > 0 &&
    feed.servedPanelIds.every((id) => panels.has(id)),
  );
  const exclusive = chassis ? totalCertified : fullyCovered;
  const rated = chassis ? load.totalRatedCurrentA :
    exclusive ? scopedFeeds.reduce((sum, feed) => sum + feed.ratedCurrentA!, 0) : null;
  const used = chassis ? load.totalCurrentA :
    exclusive ? scopedFeeds.reduce((sum, feed) => sum + feed.currentA!, 0) : null;
  const available = exclusive && rated !== null && used !== null ? rated - used : null;
  const ratio = rated !== null && used !== null && rated > 0 ? (used / rated) * 100 : null;
  const simulated = scopedFeeds.some((feed) => feed.status === 'LAB_LIVE');
  const shared = scopedFeeds.some((feed) => feed.servedPanelIds.some((id) => !panels.has(id))) ||
    (root.equipmentType === 'PANEL' && scopedFeeds.some((feed) => feed.servedPanelIds.length > 1));

  return (
    <section className="ec-snmp-capacity" aria-label="SNMP incoming DC feeder capacity">
      <header>
        <div>
          <strong>SNMP · DC input capacity</strong>
          <small>{chassis ? 'BDFB incoming independent shunts' : 'Recorded feeds serving this physical scope'}</small>
        </div>
        <span>{simulated ? 'LAB SIMULATED' : exclusive ? 'VERIFIED LIVE' : 'INCOMPLETE / SHARED'}</span>
      </header>
      <div className="ec-snmp-capacity-metrics">
        <div><small>Measured current</small><strong>{quantity(used)}</strong></div>
        <div><small>Rated current</small><strong>{quantity(rated)}</strong></div>
        <div><small>Available capacity</small><strong>{quantity(available)}</strong></div>
      </div>
      {exclusive && ratio !== null && (
        <div className="ec-snmp-utilization" role="meter" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, ratio))}
          aria-label="Verified incoming feeder capacity used">
          <div style={{ width: `${Math.min(100, Math.max(0, ratio))}%` }} />
          <span>{ratio.toFixed(1)}% used · {quantity(available)} remaining</span>
        </div>
      )}
      <div className="ec-snmp-feed-tags">
        {scopedFeeds.map((feed) => (
          <span key={feed.accessPortId}>
            {feed.feedPosition ?? feed.label}: {quantity(feed.currentA)} / {quantity(feed.ratedCurrentA)} ·
            {feed.status === 'LAB_LIVE' ? ' SIMULATED' : feed.status}
            {feed.servedPanelIds.length > 1 ? ' · shared shunt' : ''}
          </span>
        ))}
      </div>
      {(simulated || shared || !exclusive) && (
        <p>
          {simulated ? 'Synthetic SNMP readings cannot certify available physical capacity. ' : ''}
          {shared ? 'A shunt serves multiple panels: its current is not attributed separately to each. ' : ''}
          {!exclusive ? 'Remaining amperage is withheld until all relevant feeds, ratings and physical mappings are verified.' : ''}
        </p>
      )}
    </section>
  );
}
