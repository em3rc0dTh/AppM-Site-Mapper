'use client';

import { StatePanel } from '@/shared/ui/primitives';

import type { WorkspacePinnedItem } from '@/modules/workspace/application/workspace-service';
import { openPhysicalPopup } from '@/shared/ui/physical-popup';

export function PinnedInventory({ items }: Readonly<{ items: readonly WorkspacePinnedItem[] }>) {
  return (
    <section className="workspace-side-section">
      <div className="workspace-section-title">
        <span>Pinned inventory</span>
      </div>
      {items.length === 0 ? (
        <StatePanel
          title="Keep important inventory close"
          description="Pin a Device or Equipment from its details to find it here."
        />
      ) : (
        <ul className="workspace-compact-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="workspace-popup-launch"
                onClick={() => openPhysicalPopup(`/popup/device/${item.id}`, 'device', item.id)}
              >
                <strong>{item.name}</strong>
                <span>{item.kind === 'DEVICE' ? 'Device' : 'Equipment'}</span>
                {item.serialNumber ? <small>{item.serialNumber}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
