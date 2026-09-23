import { StatePanel } from '@/shared/ui/primitives';
import Link from 'next/link';

import type { WorkspaceBdfbSummary } from '@/modules/workspace/application/workspace-service';

export function BdfbSummary({ items }: Readonly<{ items: readonly WorkspaceBdfbSummary[] }>) {
  return (
    <section className="panel">
      <div className="workspace-section-title">
        <span>BDFB summary</span>
        <Link href="/power">Power paths</Link>
      </div>
      {items.length === 0 ? (
        <StatePanel
          title="No distribution structure"
          description="BDFB devices will appear after their internal structure is configured."
        />
      ) : (
        <div className="workspace-card-grid">
          {items.map((item) => (
            <Link className="workspace-summary-card" href={item.href} key={item.deviceId}>
              <strong>{item.deviceName}</strong>
              <span>{item.shelves} shelves</span>
              <span>{item.frames} frames</span>
              <span>{item.panels} panels</span>
              <span>{item.endpoints} breaker/holder endpoints</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
