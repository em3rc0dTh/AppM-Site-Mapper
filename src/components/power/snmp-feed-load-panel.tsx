'use client';

import { useEffect, useState } from 'react';
import { SnmpFeedCommissioning } from '@/components/power/snmp-feed-commissioning';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';

interface PhysicalPanel {
  id: string;
  name: string;
  frameName: string;
}

function numeric(value: number | null | undefined, unit: string): string {
  return value === undefined || value === null ? '—' : `${value.toFixed(2)} ${unit}`;
}

function readablePanel(panel: PhysicalPanel): string {
  const frame = panel.frameName.match(/FRAME-(\d+)/i);
  const position = panel.name.match(/PANEL-(\d+)/i);
  return frame && position
    ? `Frame ${frame[1]} · Panel ${position[1]}`
    : panel.name;
}

export function SnmpFeedLoadPanel({
  deviceId,
  chassisId,
}: Readonly<{ deviceId: string; chassisId: string }>) {
  const [load, setLoad] = useState<SnmpBdfbLoadView | null>(null);
  const [panels, setPanels] = useState<ReadonlyMap<string, PhysicalPanel>>(new Map());
  const [error, setError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/telemetry/snmp/feeds?deviceId=${encodeURIComponent(deviceId)}`,
          { cache: 'no-store' },
        );
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const result = (await response.json()) as SnmpBdfbLoadView;
        if (active) {
          setLoad(result);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    };
    const refreshPanels = async () => {
      try {
        // Same authenticated, Device-scoped repository as the editor. No UUID lookup
        // is performed client-side against arbitrary Equipments.
        const response = await fetch(
          `/api/equipment/${encodeURIComponent(chassisId)}/available-panels`,
          { cache: 'no-store' },
        );
        if (!response.ok) return;
        const result = (await response.json()) as { panels: PhysicalPanel[] };
        if (active) setPanels(new Map(result.panels.map((panel) => [panel.id, panel])));
      } catch {
        // The live measurements remain useful if panel-name lookup is unavailable.
      }
    };
    void refresh();
    void refreshPanels();
    const interval = setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [deviceId, chassisId, refreshVersion]);

  const percent =
    load?.totalRatedCurrentA && load.totalCurrentA !== null && load.totalCurrentA !== undefined
      ? (load.totalCurrentA / load.totalRatedCurrentA) * 100
      : null;
  const awaitingVerification =
    load?.configurationIssues.some((issue) => issue.includes('NOT_VERIFIED')) ?? false;
  const inventoryRecorded =
    load !== null && load.expectedFeedCount > 0 && load.feedCount === load.expectedFeedCount;

  return (
    <>
      <section className="zip-bdfb-live-average sm-snmp-load" aria-label="BDFB SNMP input feed load">
        <header>
          <div>
            <strong>SNMP · INCOMING DC FEEDS</strong>
          </div>
          <span>{error ? 'UNAVAILABLE' : load?.status === 'COMPLETE' ? 'LIVE' : 'PENDING'}</span>
        </header>

        <div className="zip-bdfb-live-average-grid">
          <div>
            <span>INDEPENDENT FEED CURRENT</span>
            <strong>
              {!error && load?.status === 'COMPLETE' ? numeric(load.totalCurrentA, 'A') : '—'}
            </strong>
          </div>
          <div>
            <span>FEEDS LIVE / REQUIRED</span>
            <strong>{load ? `${load.freshFeedCount} / ${load.expectedFeedCount}` : '—'}</strong>
          </div>
          <div>
            <span>RATED INPUT CAPACITY</span>
            <strong>{numeric(load?.totalRatedCurrentA, 'A')}</strong>
          </div>
          <div>
            <span>INPUT UTILIZATION</span>
            <strong>{numeric(percent, '%')}</strong>
          </div>
          <div>
            <span>APPROX. INPUT POWER</span>
            <strong>{numeric(load?.totalEstimatedPowerW, 'W')}</strong>
          </div>
        </div>

        {load?.hardwareProfile && (
          <div className="sm-snmp-inventory-summary">
            <strong>
              {load.hardwareProfile === 'ELTEK_BDCBB_CONFIG_2'
                ? 'PHYSICAL CONFIGURATION 2 · SHUNTS A / B'
                : 'PHYSICAL CONFIGURATION 4 · SHUNTS A1 / A2 / B1 / B2'}
            </strong>
            <span>
              {load.feedCount} / {load.expectedFeedCount} DC inputs recorded
            </span>
            {awaitingVerification && (
              <small>Wiring verification pending. Both inputs remain excluded from total current.</small>
            )}
            {!awaitingVerification && load.inventoryStatus === 'INCOMPLETE' && (
              <small>Physical commissioning incomplete. Check the shunt-to-panel assignments.</small>
            )}
            {!!load.missingFeedPositions.length && (
              <small>Missing inputs: {load.missingFeedPositions.join(', ')}</small>
            )}
            {!inventoryRecorded && <small>Add the remaining DC inputs on the chassis.</small>}
          </div>
        )}

        <div
          className={
            load?.hardwareProfile === 'ELTEK_BDCBB_CONFIG_4'
              ? 'sm-snmp-feed-cards sm-snmp-config4'
              : 'sm-snmp-feed-cards'
          }
        >
          {load?.feeds.map((feed) => {
            const mappedPanels = feed.servedPanelIds
              .map((id) => panels.get(id))
              .filter((panel): panel is PhysicalPanel => panel !== undefined);
            return (
              <article key={feed.accessPortId} className="sm-snmp-feed-card">
                <div className="sm-snmp-feed-card-heading">
                  <strong>{feed.label}</strong>
                  <span>{feed.status}</span>
                </div>
                <small>
                  {feed.feedPosition
                    ? `Independent input ${feed.feedPosition}`
                    : feed.side
                      ? `Side ${feed.side}`
                      : 'Unassigned side'}
                </small>
                <div className="sm-snmp-feed-readings">
                  <div>
                    <span>CURRENT</span>
                    <strong>{numeric(feed.currentA, 'A')}</strong>
                  </div>
                  <div>
                    <span>VOLTAGE</span>
                    <strong>{numeric(feed.voltageV, 'V')}</strong>
                  </div>
                </div>
                <div className="sm-snmp-feed-details">
                  <small>
                    Controller: {feed.sourceIdentity ?? 'Not mapped'}
                  </small>
                  {feed.currentOid && <small>Current OID: {feed.currentOid}</small>}
                  {feed.observedAt && <small>Last reading: {feed.observedAt}</small>}
                  <div className="sm-snmp-panel-list">
                    <span>Supplied panels</span>
                    {mappedPanels.length > 0 ? (
                      mappedPanels.map((panel) => (
                        <span className="sm-snmp-panel-label" key={panel.id}>
                          {readablePanel(panel)}
                        </span>
                      ))
                    ) : (
                      <small>
                        {feed.servedPanelIds.length
                          ? `${feed.servedPanelIds.length} panels assigned`
                          : 'No panels assigned'}
                      </small>
                    )}
                  </div>
                  {feed.status === 'LIVE' && feed.overloadWarning !== null && (
                    <small>
                      Overload: {feed.overloadWarning ? 'WARNING' : 'NORMAL'}
                      {feed.overloadThresholdA !== null
                        ? ` · threshold ${feed.overloadThresholdA} A`
                        : ''}
                    </small>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!load?.feedCount && !error && (
          <p>No SNMP input feeders inventoried on this BDFB.</p>
        )}
        {(load as (SnmpBdfbLoadView & { historyAvailable?: boolean }) | null)?.historyAvailable === false && (
          <p role="alert">TimescaleDB unavailable: restored SNMP history could not be queried.</p>
        )}
        {load?.status !== 'COMPLETE' && (
          <p className="sm-snmp-no-total">
            A whole-BDFB current total is only available when every required independent shunt is
            verified, mapped and reporting fresh SNMP readings.
          </p>
        )}
        <small>
          Incoming SNMP shunt measurements are separate from the descendant Equipment MQTT average.
        </small>
      </section>
      <SnmpFeedCommissioning
        deviceId={deviceId}
        chassisId={chassisId}
        onInventoryChanged={() => setRefreshVersion((version) => version + 1)}
      />
    </>
  );
}
