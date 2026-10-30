import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AlarmAcknowledgeButton } from '@/components/alarms/alarm-acknowledge-button';
import { getAlarmSnapshot } from '@/modules/alarms/application/alarm-preview-service';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

function numericMetric(
  reported: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number | null {
  const value = reported?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'value' in value) {
    const nested = (value as { value?: unknown }).value;
    if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  }
  return null;
}

function metric(value: number | null, unit: string, digits = 2) {
  return value === null ? '—' : `${value.toFixed(digits)} ${unit}`;
}

export default async function AlarmDetailPage({
  params,
}: {
  params: Promise<{ alarmId: string }>;
}) {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) redirect('/login');

  const canAcknowledge = hasPermission(auth.value.role, 'alarms:ack');
  const { alarmId } = await params;
  const repository = await createTopologyRepository();
  const snapshot = await getAlarmSnapshot(repository);
  const alarm = snapshot.occurrences.find((item) => item.id === alarmId);
  if (!alarm) notFound();

  const latest = (await getTelemetryRuntime()).service.latest(alarm.targetId);
  const voltage = numericMetric(latest?.reported, 'voltageV');
  const current = numericMetric(latest?.reported, 'currentA');
  const power = numericMetric(latest?.reported, 'powerW');
  const energy = numericMetric(latest?.reported, 'energyKwh');

  return (
    <main className="alarm-detail-page">
      <nav className="alarm-detail-breadcrumbs">
        <Link href="/alarms">← Alarm Center</Link>
        <span>/</span>
        <strong>{alarm.code.replaceAll('_', ' ')}</strong>
      </nav>

      <header className="alarm-detail-hero" data-severity={alarm.severity.toLowerCase()}>
        <div className="alarm-detail-icon" aria-hidden="true">
          !
        </div>
        <div>
          <small>{alarm.family}</small>
          <h1>{alarm.code.replaceAll('_', ' ')}</h1>
          <p>{alarm.remarks}</p>
          <div className="alarm-detail-tags">
            <span data-severity={alarm.severity.toLowerCase()}>{alarm.severity}</span>
            <span>{alarm.state}</span>
            {alarm.confidence ? <span>{alarm.confidence}</span> : null}
            <span>{alarm.acknowledgement}</span>
            {alarm.preview ? <span>LAB PREVIEW</span> : null}
          </div>
        </div>
        <div className="alarm-detail-actions">
          <AlarmAcknowledgeButton
            alarmId={alarm.id}
            acknowledged={alarm.acknowledgement === 'ACKNOWLEDGED'}
            canAcknowledge={canAcknowledge}
          />
          <Link href={alarm.targetHref}>Go to target →</Link>
        </div>
      </header>

      <section className="alarm-detail-grid">
        <article className="alarm-detail-card">
          <header>
            <h2>Affected target</h2>
          </header>
          <strong>{alarm.targetName}</strong>
          <div className="alarm-detail-path">
            {alarm.path.map((item, index) => (
              <span key={item.id}>
                {index > 0 ? <b>›</b> : null}
                <Link href={item.href}>{item.name}</Link>
              </span>
            ))}
          </div>
          <dl>
            <dt>Opened</dt>
            <dd>{new Date(alarm.openedAt).toLocaleString()}</dd>
            <dt>State</dt>
            <dd>{alarm.state}</dd>
            <dt>ACK</dt>
            <dd>{alarm.acknowledgement}</dd>
          </dl>
        </article>

        <article className="alarm-detail-card">
          <header>
            <h2>Latest accepted measurements</h2>
          </header>
          <div className="alarm-measurement-grid">
            <div>
              <small>Voltage</small>
              <strong>{metric(voltage, 'V')}</strong>
            </div>
            <div>
              <small>Current</small>
              <strong>{metric(current, 'A')}</strong>
            </div>
            <div>
              <small>Power</small>
              <strong>{metric(power === null ? null : power / 1000, 'kW')}</strong>
            </div>
            <div>
              <small>Energy</small>
              <strong>{metric(energy, 'kWh', 4)}</strong>
            </div>
          </div>
          <p className="alarm-detail-note">
            Observation timestamp: {latest?.receivedAt ?? 'No current sample available'}. Missing
            telemetry is never rewritten as electrical zero.
          </p>
        </article>

        <article className="alarm-detail-card alarm-evidence-card">
          <header>
            <h2>Evidence</h2>
          </header>
          <div>
            <strong>Telemetry / MQTT</strong>
            <p>
              Target-bound accepted measurements and source freshness remain separate from alarm
              state.
            </p>
          </div>
          <div>
            <strong>Controller / SNMP</strong>
            <p>
              Corroborating controller evidence is shown when commissioned; silence never clears an
              explicit hardware alarm.
            </p>
          </div>
          <div>
            <strong>Correlation</strong>
            <p>
              {alarm.confidence
                ? `Alarm confidence: ${alarm.confidence}`
                : 'No correlation confidence assigned.'}
            </p>
          </div>
        </article>

        <article className="alarm-detail-card alarm-timeline-card">
          <header>
            <h2>Event timeline</h2>
          </header>
          <ol>
            <li>
              <time>{new Date(alarm.openedAt).toLocaleTimeString()}</time>
              <div>
                <strong>Condition detected</strong>
                <small>Alarm policy entered assertion.</small>
              </div>
            </li>
            <li>
              <time>{new Date(alarm.openedAt).toLocaleTimeString()}</time>
              <div>
                <strong>{alarm.code.replaceAll('_', ' ')} → ACTIVE</strong>
                <small>Occurrence created once for the real target.</small>
              </div>
            </li>
            {alarm.confidence ? (
              <li>
                <time>+ evidence</time>
                <div>
                  <strong>Confidence → {alarm.confidence}</strong>
                  <small>Independent evidence strengthened the conclusion.</small>
                </div>
              </li>
            ) : null}
            {alarm.acknowledgement === 'ACKNOWLEDGED' ? (
              <li>
                <time>ACK</time>
                <div>
                  <strong>Operator acknowledged</strong>
                  <small>Acknowledgement does not resolve the physical condition.</small>
                </div>
              </li>
            ) : null}
            <li data-pending="true">
              <time>—</time>
              <div>
                <strong>Resolution pending</strong>
                <small>
                  Automatic recovery policy will resolve the occurrence when the condition clears.
                </small>
              </div>
            </li>
          </ol>
        </article>
      </section>
    </main>
  );
}
