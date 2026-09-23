'use client';

import { useState } from 'react';

export function WorkspaceMode({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [mode, setMode] = useState<'READ' | 'EDIT'>('READ');

  return (
    <div className="workspace-mode" aria-label="Workspace mode">
      <button
        aria-pressed={mode === 'READ'}
        className={mode === 'READ' ? 'is-active' : ''}
        onClick={() => setMode('READ')}
        type="button"
      >
        Read
      </button>
      <button
        aria-pressed={mode === 'EDIT'}
        className={mode === 'EDIT' ? 'is-active' : ''}
        disabled={!canEdit}
        onClick={() => setMode('EDIT')}
        type="button"
      >
        Edit
      </button>
      <span>
        {mode === 'EDIT' ? 'Editing enabled for permitted actions' : 'Read-only workspace'}
      </span>
    </div>
  );
}
