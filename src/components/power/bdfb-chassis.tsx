'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { PinButton } from '@/components/workspace/pin-button';
import type {
  BreakerHolder,
  DeviceNode,
  Frame,
  Panel,
  Shelf,
} from '@/modules/topology/domain/entities';
import type { BreakerTelemetryReading, TelemetrySample } from '@/modules/telemetry/domain/entities';

export interface BdfbAuditTrailItem {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly href: string;
}

interface PanelContext {
  readonly shelf: Shelf;
  readonly frame: Frame;
  readonly panel: Panel;
}

function useBdfbTelemetry(deviceId: string): TelemetrySample | null {
  const [sample, setSample] = useState<TelemetrySample | null>(null);

  useEffect(() => {
    const stream = new EventSource('/api/telemetry/stream');

    const onSnapshot = (event: MessageEvent<string>) => {
      const samples = JSON.parse(event.data) as TelemetrySample[];
      setSample(samples.find((candidate) => candidate.entityId === deviceId) ?? null);
    };

    const onTelemetry = (event: MessageEvent<string>) => {
      const incoming = JSON.parse(event.data) as TelemetrySample;
      if (incoming.entityId === deviceId) setSample(incoming);
    };

    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('telemetry', onTelemetry as EventListener);

    return () => stream.close();
  }, [deviceId]);

  return sample;
}

function locationIcon(kind: string): string {
  switch (kind) {
    case 'SITE':
      return '📍';
    case 'STRUCTURE':
      return '🏢';
    case 'ROOM_SUBSTRUCTURE':
      return '🚪';
    case 'CONTAINER_CLUSTER_BAY':
      return '◆';
    case 'POSITION':
      return '◇';
    case 'CONTAINER_RACK':
      return '▥';
    default:
      return '·';
  }
}

function metric(reading: BreakerTelemetryReading | undefined, key: 'voltageV' | 'currentA' | 'powerW' | 'energyKwh') {
  return reading?.metrics[key]?.value;
}

function format(value: number | undefined, unit: string, decimals = 2): string {
  return value === undefined ? '—' : `${value.toFixed(decimals)}${unit}`;
}

function aggregate(readings: readonly BreakerTelemetryReading[]) {
  const currents = readings.flatMap((reading) =>
    reading.metrics.currentA ? [reading.metrics.currentA.value] : [],
  );
  const powers = readings.flatMap((reading) =>
    reading.metrics.powerW ? [reading.metrics.powerW.value] : [],
  );
  const energies = readings.flatMap((reading) =>
    reading.metrics.energyKwh ? [reading.metrics.energyKwh.value] : [],
  );
  const voltages = readings.flatMap((reading) =>
    reading.metrics.voltageV ? [reading.metrics.voltageV.value] : [],
  );

  return {
    currentA: currents.length ? currents.reduce((sum, value) => sum + value, 0) : undefined,
    powerW: powers.length ? powers.reduce((sum, value) => sum + value, 0) : undefined,
    energyKwh: energies.length ? energies.reduce((sum, value) => sum + value, 0) : undefined,
    voltageV: voltages.length
      ? voltages.reduce((sum, value) => sum + value, 0) / voltages.length
      : undefined,
  };
}

function LocationContext({
  trail,
  device,
  activePanel,
  onSelectPanel,
  onDeviceOverview,
}: Readonly<{
  trail: readonly BdfbAuditTrailItem[];
  device: DeviceNode;
  activePanel: PanelContext | null;
  onSelectPanel: (panel: PanelContext) => void;
  onDeviceOverview: () => void;
}>) {
  const shelves = device.bdfb?.shelves ?? [];

  return (
    <aside className="zip-bdfb-context">
      <section className="zip-audit-location">
        <h2>LOCATION CONTEXT</h2>
        <ol>
          {trail
            .filter((item) =>
              ['SITE', 'STRUCTURE', 'ROOM_SUBSTRUCTURE', 'CONTAINER_CLUSTER_BAY', 'POSITION', 'CONTAINER_RACK'].includes(
                item.kind,
              ),
            )
            .map((item) => (
              <li key={item.id}>
                <span aria-hidden="true">{locationIcon(item.kind)}</span>
                <Link href={item.href}>{item.name}</Link>
              </li>
            ))}
        </ol>
      </section>

      <section className="zip-bdfb-internals-tree">
        <h2>{activePanel ? 'PANEL INTERNALS' : 'DEVICE INTERNALS'}</h2>

        <button
          type="button"
          className={activePanel ? '' : 'is-active'}
          onClick={onDeviceOverview}
        >
          <span>〽</span>
          <strong>{device.name}</strong>
        </button>

        {!activePanel &&
          shelves.map((shelf) => (
            <div className="zip-bdfb-tree-shelf" key={shelf.id}>
              <strong>▱ {shelf.label}</strong>
              {shelf.frames.map((frame) => (
                <div className="zip-bdfb-tree-frame" key={frame.id}>
                  <span>◇ {frame.label}</span>
                  {frame.panels.map((panel) => (
                    <button
                      type="button"
                      key={panel.id}
                      onClick={() => onSelectPanel({ shelf, frame, panel })}
                    >
                      · {panel.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}

        {activePanel && (
          <div className="zip-panel-left-summary">
            <span>ACTIVE PANEL</span>
            <strong>{activePanel.panel.label}</strong>
          </div>
        )}
      </section>
    </aside>
  );
}

function BdfbOverview({
  device,
  trail,
  telemetry,
  canWrite,
  onSelectPanel,
}: Readonly<{
  device: DeviceNode;
  trail: readonly BdfbAuditTrailItem[];
  telemetry: TelemetrySample | null;
  canWrite: boolean;
  onSelectPanel: (panel: PanelContext) => void;
}>) {
  const shelves = device.bdfb?.shelves ?? [];
  const frames = shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const readings = telemetry?.breakerReadings ?? [];
  const totals = aggregate(readings);
  const shortId = device.legacyId ?? device.id.slice(0, 8).toUpperCase();

  return (
    <>
      <LocationContext
        trail={trail}
        device={device}
        activePanel={null}
        onSelectPanel={onSelectPanel}
        onDeviceOverview={() => undefined}
      />

      <main className="zip-bdfb-center">
        <header className="zip-bdfb-titlebar">
          <div>
            <span>TECHNICAL AUDIT VIEW</span>
            <h1>{device.name}</h1>
          </div>
          <div className="zip-bdfb-system-id">
            <span>SYSTEM: BDFB</span>
            <small>UID: {shortId}</small>
            <b>▣</b>
          </div>
        </header>

        <div className="zip-bdfb-device-stage">
          <div className="zip-bdfb-device-shell">
            <div className="zip-bdfb-shell-topline">
              <span className="zip-signal-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <strong>INTEGRATED POWER DISTRIBUTION CENTER</strong>
            </div>

            <div className="zip-bdfb-ports">
              <div>
                <span>PORT A2</span>
                <b />
              </div>
              <div>
                <span>PORT B2</span>
                <b />
              </div>
            </div>

            {shelves.map((shelf) => (
              <section className="zip-bdfb-shelf-module" key={shelf.id}>
                <header>
                  <div>
                    <span>MODULE UNIT</span>
                    <h2>{shelf.label}</h2>
                  </div>
                  <div>
                    <span>LOAD STATUS</span>
                    <b>{readings.length ? 'NOMINAL' : 'WAITING'}</b>
                  </div>
                </header>

                <div className="zip-bdfb-frame-columns">
                  {shelf.frames.map((frame) => (
                    <section className="zip-bdfb-frame-module" key={frame.id}>
                      <header>
                        <strong>{frame.label}</strong>
                        <span>MODULE UNIT</span>
                      </header>

                      <div className="zip-bdfb-panel-cards">
                        {frame.panels.map((panel) => (
                          <button
                            type="button"
                            key={panel.id}
                            onClick={() => onSelectPanel({ shelf, frame, panel })}
                          >
                            <span>PANEL</span>
                            <strong>{panel.label}</strong>
                            <i aria-hidden="true">
                              <b />
                              <b />
                              <b />
                              <b />
                              <b />
                              <b />
                            </i>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <aside className="zip-bdfb-properties">
        <header>PROPERTIES</header>

        <section className="zip-bdfb-device-card">
          <span aria-hidden="true">〽</span>
          <strong>{device.name}</strong>
          <p>Select any shelf, frame, or panel to inspect details.</p>
          <small>ID: {shortId}</small>
        </section>

        {canWrite && (
          <div className="zip-bdfb-pin-card">
            <PinButton id={device.id} initialPinned={device.pinned} />
          </div>
        )}

        <section className="zip-bdfb-capacity">
          <h3>INFRAESTRUCTURA CAPACIDAD</h3>
          <div>
            <strong>{frames.length}</strong>
            <span>FRAMES</span>
          </div>
          <div>
            <strong>{panels.length}</strong>
            <span>PANELES</span>
          </div>
        </section>

        <section className="zip-bdfb-energy">
          <h3>⚡ LIVE ENERGY AUDIT</h3>
          <div className="zip-energy-primary">
            <span>CONSUMO TOTAL</span>
            <strong>{format(totals.currentA, 'A')}</strong>
          </div>
          <div className="zip-energy-pair">
            <div>
              <span>POTENCIA ACTIVA</span>
              <strong>{format(totals.powerW, 'W')}</strong>
            </div>
            <div>
              <span>ENERGÍA TOTAL</span>
              <strong>{format(totals.energyKwh, 'kWh', 4)}</strong>
            </div>
          </div>
          <div className="zip-energy-source-count">
            <span>FUENTES MONITOREADAS</span>
            <b>{readings.length ? `${readings.length} Breakers` : 'Waiting for MQTT'}</b>
          </div>
        </section>
      </aside>
    </>
  );
}

function PanelAudit({
  device,
  trail,
  context,
  telemetry,
  canWrite,
  onBack,
}: Readonly<{
  device: DeviceNode;
  trail: readonly BdfbAuditTrailItem[];
  context: PanelContext;
  telemetry: TelemetrySample | null;
  canWrite: boolean;
  onBack: () => void;
}>) {
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const readings = telemetry?.breakerReadings ?? [];
  const readingsByBreaker = useMemo(
    () =>
      Object.fromEntries(readings.map((reading) => [reading.breakerId, reading])) as Readonly<
        Record<string, BreakerTelemetryReading>
      >,
    [readings],
  );

  const panelReadings = readings.filter((reading) => reading.panelId === context.panel.id);
  const totals = aggregate(panelReadings);
  const selectedEndpoint =
    context.panel.endpoints.find((endpoint) => endpoint.id === selectedEndpointId) ?? null;
  const selectedReading = selectedEndpoint ? readingsByBreaker[selectedEndpoint.id] : undefined;

  return (
    <>
      <LocationContext
        trail={trail}
        device={device}
        activePanel={context}
        onSelectPanel={() => undefined}
        onDeviceOverview={onBack}
      />

      <main className="zip-panel-center">
        <header className="zip-panel-titlebar">
          <span>HIGH DENSITY AUDIT <i /></span>
          <h1>
            {context.panel.label} <b>/ {context.panel.endpoints.length} Slots</b>
          </h1>
        </header>

        <div className="zip-panel-audit-stage">
          <div className="zip-panel-source-row" aria-hidden="true">
            <div>
              <span>SOURCE B</span>
              <b>BUS B</b>
              <strong>TB</strong>
            </div>
            <div>
              <span>SOURCE A</span>
              <b>BUS A</b>
              <strong>TB</strong>
            </div>
            <div className="is-return">
              <span>SOURCE RTN</span>
              <b>RTN</b>
              <strong>IN</strong>
            </div>
          </div>

          <div className="zip-panel-lanes">
            <div className="zip-panel-bus zip-panel-bus--b">
              <span>BUS B</span>
            </div>
            <div className="zip-panel-bus zip-panel-bus--a">
              <span>BUS A</span>
            </div>
            <div className="zip-panel-bus zip-panel-bus--rtn">
              <span>RTN</span>
            </div>

            <div className="zip-panel-endpoints">
              {context.panel.endpoints.map((endpoint, index) => {
                const reading = readingsByBreaker[endpoint.id];
                const selected = selectedEndpointId === endpoint.id;

                return (
                  <button
                    type="button"
                    key={endpoint.id}
                    className={[
                      'zip-panel-endpoint',
                      `is-${endpoint.variant.toLowerCase()}`,
                      selected ? 'is-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedEndpointId(endpoint.id)}
                  >
                    <span>{index + 1}</span>
                    <strong>{endpoint.label}</strong>
                    {endpoint.variant === 'BREAKER' && <b aria-hidden="true">⌁</b>}
                    <small>
                      {reading
                        ? `${format(metric(reading, 'voltageV'), 'V')} · ${format(metric(reading, 'currentA'), 'A')}`
                        : endpoint.variant}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <aside className="zip-panel-properties">
        <header>INSPECCIÓN TÉCNICA</header>

        <button type="button" className="zip-panel-back" onClick={onBack}>
          ← VER RESUMEN GENERAL
        </button>

        {!selectedEndpoint ? (
          <>
            <section className="zip-panel-summary-card">
              <span>PANEL SUMMARY</span>
              <strong>{context.panel.label}</strong>
            </section>

            <section className="zip-panel-metrics">
              <h3>GLOBAL LOAD AUDIT</h3>
              <div>
                <span>Used (Amps)</span>
                <strong>{format(totals.currentA, 'A')}</strong>
              </div>
              <div>
                <span>Total Power</span>
                <strong>{format(totals.powerW, 'W')}</strong>
              </div>
              <div>
                <span>Avg Voltage</span>
                <strong>{format(totals.voltageV, 'V')}</strong>
              </div>
              <div>
                <span>Total Energy</span>
                <strong>{format(totals.energyKwh, 'kWh', 4)}</strong>
              </div>
            </section>

            <div className="zip-panel-waiting">
              <i />
              {panelReadings.length ? 'LIVE TELEMETRY' : 'WAITING FOR TELEMETRY...'}
            </div>
          </>
        ) : (
          <>
            <section className="zip-breaker-card">
              <div>
                <span>COMPONENTE</span>
                <b>{selectedEndpoint.variant === 'BREAKER' ? 'ACTIVO' : 'HOLDER'}</b>
              </div>
              <strong>{selectedEndpoint.label}</strong>
            </section>

            <section className="zip-breaker-metrics">
              <h3>MÉTRICAS EN TIEMPO REAL</h3>
              <div>
                <span>Capacidad Teórica</span>
                <strong>
                  {selectedEndpoint.capacity === undefined ? '—' : `${selectedEndpoint.capacity}A`}
                </strong>
              </div>
              <div>
                <span>Voltage</span>
                <strong>{format(metric(selectedReading, 'voltageV'), 'V')}</strong>
              </div>
              <div>
                <span>Current</span>
                <strong>{format(metric(selectedReading, 'currentA'), 'A')}</strong>
              </div>
              <div>
                <span>Power</span>
                <strong>{format(metric(selectedReading, 'powerW'), 'W')}</strong>
              </div>
            </section>

            <section className="zip-breaker-wiring">
              <h3>CONEXIÓN / BINDING</h3>
              <dl>
                <div>
                  <dt>Panel</dt>
                  <dd>{context.panel.label}</dd>
                </div>
                <div>
                  <dt>Frame</dt>
                  <dd>{context.frame.label}</dd>
                </div>
                <div>
                  <dt>MQTT point</dt>
                  <dd>{selectedEndpoint.telemetry?.rawPointId ?? 'Not bound'}</dd>
                </div>
                <div>
                  <dt>State</dt>
                  <dd>{selectedReading?.state?.value ?? 'Not reported'}</dd>
                </div>
              </dl>
            </section>
          </>
        )}

        {canWrite && (
          <div className="zip-panel-pin">
            <PinButton id={device.id} initialPinned={device.pinned} />
          </div>
        )}
      </aside>
    </>
  );
}

export function BdfbChassis({
  device,
  trail,
  canWrite,
}: Readonly<{
  device: DeviceNode;
  trail: readonly BdfbAuditTrailItem[];
  canWrite: boolean;
}>) {
  const [activePanel, setActivePanel] = useState<PanelContext | null>(null);
  const telemetry = useBdfbTelemetry(device.id);

  return (
    <section className="zip-bdfb-audit">
      {activePanel ? (
        <PanelAudit
          device={device}
          trail={trail}
          context={activePanel}
          telemetry={telemetry}
          canWrite={canWrite}
          onBack={() => setActivePanel(null)}
        />
      ) : (
        <BdfbOverview
          device={device}
          trail={trail}
          telemetry={telemetry}
          canWrite={canWrite}
          onSelectPanel={setActivePanel}
        />
      )}
    </section>
  );
}
