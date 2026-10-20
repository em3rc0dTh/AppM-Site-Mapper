'use client';

import Link from 'next/link';

import { useTelemetryStream } from '@/components/telemetry/use-bdfb-telemetry';
import {
  aggregateBdfbDescendantTelemetry,
  type BdfbDescendantTelemetry,
} from '@/modules/telemetry/application/bdfb-descendant-telemetry';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { WorkspaceBdfbSummary } from '@/modules/workspace/application/workspace-service';

type Pin = { id: string; name: string; kind: string; context: string; href: string };
type BdfbRow = WorkspaceBdfbSummary & BdfbDescendantTelemetry;

function fresh(iso: string, now: number): boolean {
  const age = now - Date.parse(iso);
  return Number.isFinite(age) && age >= -30_000 && age <= 30_000;
}

function projectBdfb(
  samples: readonly TelemetrySample[],
  item: WorkspaceBdfbSummary,
  now: number,
): BdfbRow {
  return {
    ...item,
    ...aggregateBdfbDescendantTelemetry(samples, item.descendantEquipmentIds, now),
  };
}

function format(value: number | null, unit: string, decimals = 2): string {
  return value === null ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

export function HomeLiveOverview({
  equipmentIds,
  bdfbs,
  cards,
  initialSamples,
}: {
  equipmentIds: readonly string[];
  bdfbs: readonly WorkspaceBdfbSummary[];
  cards: readonly Pin[];
  initialSamples: readonly TelemetrySample[];
}) {
  const { samples: streamed, now, hasSnapshot } = useTelemetryStream();
  const samples = hasSnapshot ? streamed : initialSamples;
  const rows = bdfbs.map((item) => projectBdfb(samples, item, now));
  const online = equipmentIds.filter(
    (id) =>
      rows.some((row) => row.deviceId === id && row.reportingEquipment > 0) ||
      samples.some(
        (sample) =>
          sample.targetId === id &&
          sample.metricBindingIds?.length &&
          fresh(sample.receivedAt, now),
      ),
  ).length;
  const unknown = equipmentIds.length - online;
  const reporting = rows.filter((row) => row.totalPowerW !== null);
  const totalPowerW = reporting.reduce((sum, row) => sum + row.totalPowerW!, 0);
  const partial = reporting.length !== rows.length;
  const monitoring = rows.filter((row) => row.reportingEquipment > 0).length;

  return (
    <>
      <div className="sm-home-stats">
        <article>
          <small>EQUIPMENTS (PRIMARY)</small>
          <strong>{equipmentIds.length}</strong>
          <span>Managed Devices; nested Equipment excluded</span>
        </article>
        <article>
          <small>REPORTING</small>
          <strong>{online}</strong>
          <span>Primary Devices with recent bound telemetry</span>
        </article>
        <article>
          <small>NO RECENT DATA</small>
          <strong>{unknown}</strong>
          <span>Unknown telemetry, not evidence of power off</span>
        </article>
      </div>

      <section className="sm-home-section">
        <div className="sm-home-section-heading">
          <h2>DIRECT ACCESS</h2>
          <Link href="/network">Manage pins →</Link>
        </div>
        <div className="sm-home-pin-grid">
          {cards.map((pin) => {
            const bdfb = rows.find((row) => row.deviceId === pin.id);
            return (
              <Link href={pin.href} className="sm-home-pin" key={pin.id}>
                <div>
                  <span>▣</span>
                  <strong>{pin.name}</strong>
                </div>
                <small title={pin.context}>{pin.context}</small>
                {bdfb ? (
                  <>
                    <div className="sm-home-pin-readings">
                      <span>Avg. voltage <b>{format(bdfb.averageVoltageV, 'V')}</b></span>
                      <span>Avg. current <b>{format(bdfb.averageCurrentA, 'A')}</b></span>
                      <span>Avg. power <b>{format(bdfb.averagePowerW, 'W')}</b></span>
                      <span>Avg. energy counter <b>{format(bdfb.averageEnergyKwh, 'kWh', 4)}</b></span>
                      <span>Total power <b>{format(bdfb.totalPowerW === null ? null : bdfb.totalPowerW / 1000, 'kW')}</b></span>
                      <span>Equipment reporting <b>{bdfb.reportingEquipment} / {bdfb.descendantEquipment}</b></span>
                    </div>
                    <small className="sm-home-telemetry-note">
                      Entire BDFB · commissioned descendant Equipment · last {bdfb.latestReceivedAt ?? '—'}
                    </small>
                  </>
                ) : (
                  <p>Equipment details</p>
                )}
                <em>Open →</em>
              </Link>
            );
          })}
          <Link className="sm-home-pin sm-home-add-pin" href="/network">
            + Add pinned equipment
          </Link>
        </div>
      </section>

      <section className="sm-home-section" aria-label="System-wide BDFB power">
        <div className="sm-home-section-heading">
          <h2>BDFB POWER OVERVIEW</h2>
          <span>ALL BDFBs · SYSTEM WIDE</span>
        </div>
        <div className="sm-home-stats">
          <article>
            <small>TOTAL POWER (LIVE)</small>
            <strong>{reporting.length ? format(totalPowerW / 1000, 'kW') : '—'}</strong>
            <span>{partial ? 'Partial: BDFB(s) without current power omitted' : 'Sum of current descendant power'}</span>
          </article>
          <article>
            <small>PERIOD ENERGY</small>
            <strong>—</strong>
            <span>Not available until a validated TimescaleDB period calculation exists</span>
          </article>
          <article>
            <small>BDFB MONITORING</small>
            <strong>{monitoring} / {rows.length}</strong>
            <span>BDFBs with recent descendant Equipment metrics</span>
          </article>
        </div>
        {partial && (
          <p className="sm-home-warning">
            Total power is partial: {rows.length - reporting.length} BDFB(s) have no valid
            current power. Missing measurements are not treated as zero.
          </p>
        )}
        <div className="sm-home-section-heading">
          <h2>TELEMETRY BY BDFB</h2>
          <Link href="/telemetry">Telemetry →</Link>
        </div>
        <div className="sm-home-table-wrap">
          <table className="sm-home-table">
            <thead>
              <tr>
                <th>BDFB</th>
                <th>Avg. V</th>
                <th>Avg. A</th>
                <th>Avg. W</th>
                <th>Avg. counter</th>
                <th>Total kW</th>
                <th>Reporting Equipment</th>
                <th>Last sample</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.deviceId}>
                  <td><strong>{row.deviceName}</strong></td>
                  <td>{format(row.averageVoltageV, 'V')}</td>
                  <td>{format(row.averageCurrentA, 'A')}</td>
                  <td>{format(row.averagePowerW, 'W')}</td>
                  <td>{format(row.averageEnergyKwh, 'kWh', 4)}</td>
                  <td>{format(row.totalPowerW === null ? null : row.totalPowerW / 1000, 'kW')}</td>
                  <td>{row.reportingEquipment} / {row.descendantEquipment}</td>
                  <td>{row.latestReceivedAt ?? '—'}</td>
                  <td><Link href={row.href}>Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="sm-home-warning">No BDFBs found.</p>}
        </div>
        <p className="sm-home-telemetry-note">
          Live averages use latest valid bound Equipment readings (30 s window). The energy
          counter average is not period consumption; LIVE power is a sum, not a mean.
        </p>
      </section>
    </>
  );
}
