'use client';

import { useState, type ReactNode } from 'react';

interface Props {
  readonly physical: ReactNode;
  readonly operation: ReactNode;
  readonly maintenance?: ReactNode;
  readonly label: string;
}

/** FRONT-01 is a presentation split; all original editors and service contracts are reused. */
export function Front01StageTabs({ physical, operation, maintenance, label }: Props) {
  const [view, setView] = useState<'physical' | 'operation' | 'maintenance'>('physical');
  const views = [
    { key: 'physical', title: 'Vista física' },
    { key: 'operation', title: 'Operación' },
    ...(maintenance ? [{ key: 'maintenance', title: 'Mantenimiento' }] : []),
  ] as const;

  return (
    <div className="front01-stage">
      <div className="front01-primary-tabs" role="tablist" aria-label={label}>
        {views.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`front01-tab-${item.key}`}
            aria-selected={view === item.key}
            aria-controls={`front01-panel-${item.key}`}
            onClick={() => setView(item.key)}
          >
            {item.title}
          </button>
        ))}
      </div>
      <div id="front01-panel-physical" role="tabpanel" aria-labelledby="front01-tab-physical" hidden={view !== 'physical'}>
        {physical}
      </div>
      {view === 'operation' && (
        <div id="front01-panel-operation" className="front01-operational-content" role="tabpanel" aria-labelledby="front01-tab-operation">
          {operation}
        </div>
      )}
      {view === 'maintenance' && maintenance && (
        <div id="front01-panel-maintenance" className="front01-operational-content" role="tabpanel" aria-labelledby="front01-tab-maintenance">
          {maintenance}
        </div>
      )}
    </div>
  );
}
