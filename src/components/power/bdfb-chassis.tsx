'use client';

import Link from 'next/link';
import { ContextPin } from '@/components/workspace/context-pin';
import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import type { DeviceNode } from '@/modules/topology/domain/entities';

export interface BreakerPowerBinding {
  readonly breakerId: string;
  readonly pathId: string;
  readonly feed?: 'A' | 'B';
  readonly counterpartName: string;
  readonly counterpartHref: string;
  readonly counterpartContext: string;
  readonly accessPortLabel?: string;
  readonly mount?: string;
}
export interface BreakerTelemetryBindingSummary {
  readonly breakerId: string;
  readonly sourceIdentity: string;
  readonly sourcePointId: string;
  readonly metric: string;
}

/**
 * Physical BDFB hierarchy is a read-only projection of the canonical Equipment
 * tree. Panel detail belongs to Equipment Composition, never to a second,
 * legacy breaker-position renderer.
 */
export function BdfbChassis({
  device,
  presentation,
}: Readonly<{
  device: DeviceNode;
  presentation: BdfbPresentation;
  powerBindings?: readonly BreakerPowerBinding[];
  telemetryBindings?: readonly BreakerTelemetryBindingSummary[];
  canWritePower?: boolean;
}>) {
  const frames = presentation.shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  return (
    <section className="bdfb-chassis sm-bdfb-modern">
      <header className="bdfb-chassis-header">
        <div>
          <span>PHYSICAL COMPOSITION</span>
          <strong>{device.name}</strong>
          <small>Device → Chassis → Shelf → Frame → Panel → Equipment</small>
        </div>
        <div className="bdfb-chassis-status">
          <ContextPin entityId={device.id} />
          <Link className="bdfb-open-chassis" href={`/device/${presentation.chassisId}`}>OPEN CHASSIS COMPOSITION →</Link>
          <span>{presentation.shelves.length} shelves</span>
          <span>{frames.length} frames</span>
          <span>{panels.length} panels</span>
        </div>
      </header>
      <div className="sm-bdfb-physical-body">
        <article className="sm-bdfb-physical-chassis">
          <div className="sm-bdfb-physical-title">CHASSIS · {device.name}</div>
          {presentation.shelves.map((shelf) => (
            <section key={shelf.id} className="sm-bdfb-physical-shelf">
              <div className="sm-bdfb-physical-title">{shelf.physical === false ? 'PANEL GROUP' : 'SHELF'} · {shelf.label}</div>
              <div className="sm-bdfb-physical-frames">
                {shelf.frames.map((frame) => (
                  <section key={frame.id} className="sm-bdfb-physical-frame">
                    <div className="sm-bdfb-physical-title">{frame.physical ? 'FRAME' : 'GROUP'} · {frame.label}</div>
                    <div className="sm-bdfb-physical-panels">
                      {frame.panels.map((panel) => {
                        const installed = panel.positions.filter(Boolean).length;
                        return (
                          <Link className="sm-bdfb-physical-panel" key={panel.id} href={`/device/${panel.id}`} title={`Open Equipment Composition: ${panel.label}`}>
                            <strong>{panel.label}</strong>
                            <span>{installed} installed · {panel.positions.length - installed} available positions</span>
                            <small>OPEN PANEL COMPOSITION →</small>
                          </Link>
                        );
                      })}
                      {!frame.panels.length && <p>No installed panels</p>}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ))}
          {!presentation.shelves.length && <p>No physical shelf or panel has been configured.</p>}
        </article>
      </div>
    </section>
  );
}
