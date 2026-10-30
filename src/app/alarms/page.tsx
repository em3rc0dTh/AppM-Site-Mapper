import { redirect } from 'next/navigation';

import { getAlarmSnapshot } from '@/modules/alarms/application/alarm-preview-service';
import { AlarmCenterClient } from '@/components/alarms/alarm-center-client';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

export default async function AlarmCenterPage() {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) redirect('/login');

  const repository = await createTopologyRepository();
  const snapshot = await getAlarmSnapshot(repository);
  const active = snapshot.occurrences.filter((item) => item.state === 'ACTIVE');
  const critical = active.filter((item) => item.severity === 'CRITICAL').length;
  const warning = active.filter((item) => item.severity === 'WARNING').length;
  const info = active.filter((item) => item.severity === 'INFO').length;
  const unack = active.filter((item) => item.acknowledgement === 'UNACKNOWLEDGED').length;

  return (
    <main className="alarm-center-page">
      <header className="alarm-center-heading">
        <div>
          <span>⚠ OPERATIONAL ALARMS</span>
          <h1>Alarm Center</h1>
          <p>Active incidents across the physical infrastructure hierarchy.</p>
        </div>
        {snapshot.preview ? <strong>LAB PREVIEW · seed-01</strong> : null}
      </header>

      <section className="alarm-center-stats">
        <article><b>{active.length}</b><span>Active</span></article>
        <article><b>{unack}</b><span>Without ACK</span></article>
        <article data-severity="critical"><b>{critical}</b><span>Critical</span></article>
        <article data-severity="warning"><b>{warning}</b><span>Warning</span></article>
        <article data-severity="info"><b>{info}</b><span>Info</span></article>
      </section>

      <AlarmCenterClient occurrences={snapshot.occurrences} />
    </main>
  );
}
