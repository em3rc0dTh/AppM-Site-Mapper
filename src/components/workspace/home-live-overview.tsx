'use client';

import Link from 'next/link';
import { useTelemetryStream } from '@/components/telemetry/use-bdfb-telemetry';
import { bdfbSourceView } from '@/modules/telemetry/domain/bdfb-source-view';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { WorkspaceBdfbSummary } from '@/modules/workspace/application/workspace-service';

type Pin = { id: string; name: string; kind: string; context: string; href: string };
type BdfbRow = WorkspaceBdfbSummary & { powerW: number | null; circuitCount: number; latest: string | null; voltageV: number | null; currentA: number | null; coverage: number };

const fresh = (iso: string, now: number) => {
  const at = Date.parse(iso);
  return Number.isFinite(at) && now - at >= -30000 && now - at <= 30000;
};

function projectBdfb(samples: readonly TelemetrySample[], item: WorkspaceBdfbSummary, now: number): BdfbRow {
  const projection = bdfbSourceView(samples, item.deviceId, now);
  const breakerReadings = projection?.breakerReadings ?? [];
  // Each breaker can only contribute once. The source projection excludes competing source mappings.
  const powers = breakerReadings.filter((r) => r.metrics.powerW && Number.isFinite(r.metrics.powerW.value) && fresh(r.metrics.powerW.observedAt, now));
  const volts = breakerReadings.filter((r) => r.metrics.voltageV && fresh(r.metrics.voltageV.observedAt, now));
  const amps = breakerReadings.filter((r) => r.metrics.currentA && fresh(r.metrics.currentA.observedAt, now));
  const avg = (values: number[]) => values.length ? values.reduce((sum,n)=>sum+n,0)/values.length : null;
  return {
    ...item,
    powerW: powers.length ? powers.reduce((total,r)=>total+r.metrics.powerW!.value,0) : null,
    circuitCount: powers.length,
    coverage: item.endpoints,
    voltageV: avg(volts.map((r)=>r.metrics.voltageV!.value)),
    currentA: avg(amps.map((r)=>r.metrics.currentA!.value)),
    latest: projection?.receivedAt ?? null,
  };
}

export function HomeLiveOverview({equipmentIds,bdfbs,cards,initialSamples}: {
  equipmentIds: readonly string[];
  bdfbs: readonly WorkspaceBdfbSummary[];
  cards: readonly Pin[];
  initialSamples: readonly TelemetrySample[];
}) {
  const {samples: streamed, now} = useTelemetryStream();
  const samples = streamed.length ? streamed : initialSamples;
  const rows = bdfbs.map((item)=>projectBdfb(samples,item,now));
  const liveDeviceCount = equipmentIds.filter((id)=>rows.some((r)=>r.deviceId===id && r.latest && fresh(r.latest,now)) ||
    samples.some((sample)=>sample.targetId===id && fresh(sample.receivedAt,now))).length;
  const online = liveDeviceCount;
  const unknown = equipmentIds.length-online;
  const reporting = rows.filter((r)=>r.powerW !== null);
  const totalPowerW = reporting.reduce((sum,r)=>sum+r.powerW!,0);
  const fmt = (n:number|null,unit:string)=>n === null ? '—' : `${n.toFixed(2)} ${unit}`;

  return <>
    <div className="sm-home-stats">
      <article><small>EQUIPMENTS (PRIMARY)</small><strong>{equipmentIds.length}</strong><span>Managed devices, excluding nested components</span></article>
      <article><small>REPORTING</small><strong>{online}</strong><span>Recently received telemetry</span></article>
      <article><small>NO RECENT DATA</small><strong>{unknown}</strong><span>Not proof that equipment is powered off</span></article>
    </div>
    <section className="sm-home-section">
      <div className="sm-home-section-heading"><h2>DIRECT ACCESS</h2><Link href="/network">Manage pins →</Link></div>
      <div className="sm-home-pin-grid">
        {cards.map((pin) => {
          // A pinned child Equipment remains an independent item. Do not silently promote its
          // own readings to the parent BDFB. Only BDFB device pins show parent aggregates.
          const bdfb = rows.find((row)=>row.deviceId===pin.id);
          return <Link href={pin.href} className="sm-home-pin" key={pin.id}>
            <div><span>▣</span><strong>{pin.name}</strong></div>
            <small title={pin.context}>{pin.context}</small>
            {bdfb ? <div className="sm-home-pin-readings">
              <span>Avg. voltage <b>{fmt(bdfb.voltageV,'V')}</b></span>
              <span>Avg. current <b>{fmt(bdfb.currentA,'A')}</b></span>
              <span>Total power <b>{fmt(bdfb.powerW === null ? null : bdfb.powerW/1000,'kW')}</b></span>
              <span>Reporting circuits <b>{bdfb.circuitCount}</b></span>
            </div> : <p>Equipment details</p>}
            <em>Open →</em>
          </Link>;
        })}
        <Link className="sm-home-pin sm-home-add-pin" href="/network">+ Add pinned equipment</Link>
      </div>
    </section>
    <section className="sm-home-section" aria-label="System-wide BDFB power">
      <div className="sm-home-section-heading"><h2>BDFB POWER OVERVIEW</h2><span>ALL BDFBs · SYSTEM WIDE</span></div>
      <div className="sm-home-stats">
        <article><small>TOTAL POWER (LIVE)</small><strong>{reporting.length ? fmt(totalPowerW/1000,'kW') : '—'}</strong><span>Partial if any BDFB lacks valid telemetry</span></article>
        <article><small>PERIOD ENERGY</small><strong>—</strong><span>Awaiting validated Timescale period calculation</span></article>
        <article><small>BDFB MONITORING</small><strong>{reporting.length} / {rows.length}</strong><span>With valid circuit power data</span></article>
      </div>
      {reporting.length !== rows.length && <p className="sm-home-warning">Total is partial: {rows.length-reporting.length} BDFB(s) have no valid live power total. Missing values are not counted as zero.</p>}
      <div className="sm-home-section-heading"><h2>POWER BY BDFB</h2><Link href="/telemetry">Telemetry →</Link></div>
      <div className="sm-home-table-wrap">
        <table className="sm-home-table">
          <thead><tr><th>BDFB</th><th>Power</th><th>Circuits reporting</th><th>Telemetry</th><th /></tr></thead>
          <tbody>{rows.map((r)=><tr key={r.deviceId}>
            <td><strong>{r.deviceName}</strong></td>
            <td>{fmt(r.powerW === null ? null : r.powerW/1000,'kW')}</td>
            <td>{r.circuitCount}{r.coverage ? ` / ${r.coverage}` : ''}</td>
            <td>{r.latest && fresh(r.latest,now) ? 'Recent packet' : 'No recent data'}</td>
            <td><Link href={r.href}>Open →</Link></td>
          </tr>)}</tbody>
        </table>
        {!rows.length && <p className="sm-home-warning">No BDFBs found.</p>}
      </div>
    </section>
  </>;
}
