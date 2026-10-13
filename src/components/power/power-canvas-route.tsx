import Link from 'next/link';

export interface PowerCanvasStage {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly href?: string;
}

export interface PowerCanvasRouteProps {
  readonly sourceStages: readonly PowerCanvasStage[];
  readonly targetStages: readonly PowerCanvasStage[];
  readonly sourceEquipmentName: string;
  readonly targetEquipmentName: string;
  readonly sourcePortName: string;
  readonly targetPortName: string;
  readonly feed?: string;
}

function glyph(kind: string) {
  if (kind === 'PANEL') return '▥';
  if (kind.includes('BREAKER')) return '▣';
  if (kind === 'DEVICE') return '▤';
  if (kind === 'SHELF' || kind === 'FRAME') return '□';
  if (kind === 'ACCESS_PORT') return '◉';
  return 'ϟ';
}

function Hierarchy({ stages }: { stages: readonly PowerCanvasStage[] }) {
  return (
    <div className="zip-power-row">
      {stages.map((stage, index) => (
        <div className="zip-power-node-wrap" key={stage.id}>
          {stage.href ? (
            <Link className="zip-power-node" href={stage.href}>
              <b>{glyph(stage.kind)}</b>
              <span>{stage.name}</span>
            </Link>
          ) : (
            <span className="zip-power-node">
              <b>{glyph(stage.kind)}</b>
              <span>{stage.name}</span>
            </span>
          )}
          {index < stages.length - 1 ? <i aria-hidden="true">→</i> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Always display the electrical POWER OUTPUT → POWER INPUT link.
 * Ancestry is secondary and may scroll inside each segment; no stage is
 * silently truncated because a Device has more than six ancestors.
 */
export function PowerCanvasRoute({
  sourceStages,
  targetStages,
  sourceEquipmentName,
  targetEquipmentName,
  sourcePortName,
  targetPortName,
  feed,
}: PowerCanvasRouteProps) {
  return (
    <div
      className="zip-power-connection"
      aria-label={`Feed ${feed ?? 'unspecified'} complete physical path`}
    >
      <div className="zip-power-route-segment">
        <h3>Source equipment hierarchy</h3>
        <Hierarchy stages={sourceStages.filter((stage) => stage.kind !== 'ACCESS_PORT')} />
      </div>
      <div className="zip-power-physical-link">
        <div className="zip-power-terminal">
          <small>POWER OUTPUT · {sourceEquipmentName}</small>
          <strong>{sourcePortName}</strong>
        </div>
        <div className="zip-power-wire-arrow">
          <span>POWER PATH · FEED {feed ?? 'UNSPECIFIED'} · CONFIGURED</span>
          <b aria-hidden="true">⟶</b>
        </div>
        <div className="zip-power-terminal">
          <small>POWER INPUT · {targetEquipmentName}</small>
          <strong>{targetPortName}</strong>
        </div>
      </div>
      <div className="zip-power-route-segment">
        <h3>Destination equipment hierarchy</h3>
        <Hierarchy stages={targetStages.filter((stage) => stage.kind !== 'ACCESS_PORT')} />
      </div>
    </div>
  );
}
