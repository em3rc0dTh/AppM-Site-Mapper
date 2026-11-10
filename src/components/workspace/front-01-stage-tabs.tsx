'use client';

import { useState, type ReactNode } from 'react';

interface Props {
  readonly physical: ReactNode;
  readonly operation: ReactNode;
  readonly label: string;
}

/**
 * FRONT-01 only changes the presentation location of existing controls.
 * Both panels keep their original application contracts and permissions.
 */
export function Front01StageTabs({ physical, operation, label }: Props) {
  const [view, setView] = useState<'physical' | 'operation'>('physical');
  return (
    <div className="front01-stage">
      <div className="front01-primary-tabs" role="tablist" aria-label={label}>
        <button type="button" role="tab" aria-selected={view === 'physical'} aria-controls="front01-physical" onClick={() => setView('physical')}>Vista física</button>
        <button type="button" role="tab" aria-selected={view === 'operation'} aria-controls="front01-operation" onClick={() => setView('operation')}>Operación</button>
      </div>
      <div id="front01-physical" role="tabpanel" hidden={view !== 'physical'}>{physical}</div>
      <div id="front01-operation" className="front01-operational-content" role="tabpanel" hidden={view !== 'operation'}>{operation}</div>
    </div>
  );
}
