import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DemoSeedButton } from '@/components/dev/demo-seed-button';
import { NavigationTree } from '@/components/workspace/navigation-tree';
import { HomeSidebar } from '@/components/workspace/home-sidebar';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { TopologyService } from '@/modules/topology/application/topology-service';
import {
  createTopologyRepository,
  getPersistenceMode,
} from '@/modules/topology/infrastructure/topology-repository-factory';
import type { WorkspaceTreeNode } from '@/modules/workspace/application/workspace-service';
import { WorkspaceService } from '@/modules/workspace/application/workspace-service';
import { readContext } from '@/modules/workspace/infrastructure/context-repository';

export const dynamic = 'force-dynamic';

function flatten(nodes: readonly WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function kindIcon(kind: string) {
  if (kind.includes('RACK')) return '▥';
  if (kind === 'DEVICE') return '▤';
  if (kind.includes('ROOM')) return '▭';
  return '▦';
}

function liveBdfb(sample: TelemetrySample | undefined, now: number) {
  if (!sample || !Number.isFinite(Date.parse(sample.receivedAt)) || now - Date.parse(sample.receivedAt) > 30000) {
    return { valid: false, watts: null as number | null, circuits: 0, updated: sample?.receivedAt };
  }
  const readings = sample.breakerReadings ?? [];
  const valid = readings.filter((reading) =>
    reading.metrics.powerW && Number.isFinite(reading.metrics.powerW.value) &&
    Math.abs(Date.parse(reading.metrics.powerW.observedAt) - now) <= 30000
  );
  return {
    valid: true,
    watts: valid.length ? valid.reduce((sum, reading) => sum + reading.metrics.powerW!.value, 0) : null,
    circuits: valid.length,
    updated: sample.receivedAt,
  };
}

export default async function WorkspacePage() {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const topologyRepo = await createTopologyRepository();
  const topology = new TopologyService(topologyRepo);
  const service = new WorkspaceService(topologyRepo, await createPowerRepository());
  const snapshot = await service.getSnapshot();
  const context = await readContext(auth.value.id);
  const allNodes = flatten(snapshot.navigation);
  const latest = (await getTelemetryRuntime()).service.snapshot();
  const pinnedNodes = (
    await Promise.all(context.pinned.map((id) => topologyRepo.getById(id)))
  ).filter((node) => node?.lifecycle === 'ACTIVE');

  const pinLinks = await Promise.all(
    pinnedNodes.map(async (node) => ({
      id: node!.id,
      name: node!.name,
      kind: node!.kind,
      href:
        node!.kind === 'CONTAINER_RACK'
          ? `/rack/${node!.id}/focus`
          : await topology.buildDeepLink(node!.id),
      context: (await topology.getTrail(node!.id))
        .slice(-3)
        .map((item) => item.name)
        .join(' › '),
    })),
  );

  const inventoryPins = snapshot.pinned
    .filter((item) => !pinLinks.some((pin) => pin.id === item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      href: item.href,
      context: item.category ?? item.kind,
    }));
  const cards = [...pinLinks, ...inventoryPins].slice(0, 3);

  const now = Date.now();
  const equipmentNodes = allNodes.filter((item) => ['DEVICE', 'EQUIPMENT'].includes(item.kind));
  const monitored = equipmentNodes.filter((node) => latest.some((sample) => sample.entityId === node.id && now - Date.parse(sample.receivedAt) <= 30000));
  const bdfbRows = snapshot.bdfb.map((item) => ({
    ...item,
    live: liveBdfb(latest.find((sample) => sample.entityId === item.deviceId), now),
  }));
  const validBdfb = bdfbRows.filter((row) => row.live.watts !== null);
  const totalWatts = validBdfb.reduce((sum, row) => sum + row.live.watts!, 0);

  const contextLabel = snapshot.navigation[0]?.name ?? 'Lima';
  const contextChild = snapshot.navigation[0]?.children[0]?.name ?? 'Building A';
  const canLoadDevelopmentDemo =
    process.env.APP_ENV === 'development' &&
    getPersistenceMode() === 'memory' &&
    allNodes.length === 0;

  return (
    <main className="sm-home">
      <HomeSidebar tree={<NavigationTree roots={snapshot.navigation} />} />
      <section className="sm-home-main">
        <header className="sm-home-heading">
          <div><span className="sm-home-breadcrumb">⌂ Home</span><h1>Infrastructure overview</h1></div>
          <span className="sm-home-scope">{contextLabel} / {contextChild}</span>
        </header>
        {canLoadDevelopmentDemo ? <DemoSeedButton /> : null}
        <div className="sm-home-stats">
          <article><small>EQUIPMENTS</small><strong>{equipmentNodes.length}</strong></article>
          <article><small>ONLINE</small><strong>{monitored.length}</strong><span>Recent telemetry</span></article>
          <article><small>OFFLINE / NO DATA</small><strong>{equipmentNodes.length - monitored.length}</strong><span>No recent telemetry; not confirmed device failure</span></article>
        </div>
        <section className="sm-home-section">
          <div className="sm-home-section-heading"><h2>DIRECT ACCESS</h2><Link href="/network">Manage pins →</Link></div>
          <div className="sm-home-pin-grid">
            {cards.map((item) => {
              const bdfb = bdfbRows.find((row) => row.deviceId === item.id);
              return <Link className="sm-home-pin" key={item.id} href={item.href}>
                <div><span>{kindIcon(item.kind)}</span><strong>{item.name}</strong></div>
                <small>{item.context}</small>
                {bdfb ? <div className="sm-home-pin-readings">
                  <span>Power <b>{bdfb.live.watts === null ? 'No data' : `${(bdfb.live.watts / 1000).toFixed(2)} kW`}</b></span>
                  <span>Circuits reporting <b>{bdfb.live.circuits}</b></span>
                </div> : <p>Open equipment details</p>}
                <em>Open →</em>
              </Link>;
            })}
            <Link className="sm-home-pin sm-home-add-pin" href="/network">+ Add pinned equipment</Link>
          </div>
        </section>
        <section className="sm-home-section" aria-label="System-wide BDFB power">
          <div className="sm-home-section-heading"><h2>BDFB POWER OVERVIEW</h2><span>ALL BDFBs · SYSTEM WIDE</span></div>
          <div className="sm-home-stats">
            <article><small>TOTAL POWER (LIVE)</small><strong>{validBdfb.length ? `${(totalWatts / 1000).toFixed(2)} kW` : '—'}</strong><span>Reporting BDFBs only</span></article>
            <article><small>PERIOD ENERGY</small><strong>—</strong><span>Requires complete historical counter interval</span></article>
            <article><small>BDFB MONITORING</small><strong>{validBdfb.length} / {bdfbRows.length}</strong><span>Valid power telemetry</span></article>
          </div>
          {validBdfb.length !== bdfbRows.length && <p className="sm-home-warning">Power total is partial: {bdfbRows.length - validBdfb.length} BDFB(s) without valid current power. Unavailable readings are never counted as zero.</p>}
          <div className="sm-home-section-heading"><h2>POWER BY BDFB</h2><Link href="/telemetry">Telemetry →</Link></div>
          <div className="sm-home-table-wrap">
            <table className="sm-home-table"><thead><tr><th>BDFB</th><th>Power</th><th>Circuits reporting</th><th>Telemetry</th><th></th></tr></thead>
            <tbody>{bdfbRows.map((row) => <tr key={row.deviceId}>
              <td><strong>{row.deviceName}</strong></td>
              <td>{row.live.watts === null ? '—' : `${(row.live.watts / 1000).toFixed(2)} kW`}</td>
              <td>{row.live.circuits}</td>
              <td>{row.live.valid ? 'Recent' : 'No recent data'}</td>
              <td><Link href={row.href}>Open →</Link></td>
            </tr>)}</tbody></table>
            {!bdfbRows.length && <p className="sm-home-warning">No configured BDFBs were found in the system.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
