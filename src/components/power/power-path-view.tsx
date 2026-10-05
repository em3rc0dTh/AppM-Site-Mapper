'use client';

import { useState } from 'react';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge, Surface } from '@/shared/ui/primitives';

export interface PowerStage {
  id: string;
  kind: string;
  name: string;
}
export function PowerPathView({
  label,
  feed,
  stages,
}: {
  label: string;
  feed: string;
  stages: readonly PowerStage[];
}) {
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  return (
    <Surface className="power-card">
      <header className="power-card-header">
        <h2>{label}</h2>
        <StatusBadge tone={feed === 'A' ? 'accent' : feed === 'B' ? 'warning' : 'neutral'}>
          {feed ? `FEED ${feed}` : 'FEED UNSPECIFIED'}
        </StatusBadge>
      </header>
      <div className="power-flow" aria-label={`Power path ${label}`}>
        {stages.map((stage, index) => (
          <div key={`${index}-${stage.id}`} className="power-stage">
            <button
              type="button"
              aria-label={`Inspect ${stage.name}`}
              onClick={() =>
                setSelected({
                  name: stage.name,
                  kind: stage.kind,
                  sections: [
                    {
                      title: 'Overview',
                      fields: [
                        { label: 'Path', value: label },
                        { label: 'Feed', value: feed || 'Not specified' },
                        { label: 'Reference', value: stage.id },
                      ],
                    },
                  ],
                })
              }
            >
              <small>
                {index === 0 ? 'Source / ' : index === stages.length - 1 ? 'Target / ' : ''}
                {stage.kind.replaceAll('_', ' ')}
              </small>
              <strong>{stage.name}</strong>
            </button>
            {index < stages.length - 1 && (
              <span className="power-step-arrow" aria-hidden="true">
                ↓
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="telemetry-unit-note">
        Configured connection · electrical health requires telemetry.
      </p>
      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </Surface>
  );
}
