import { getTranslations } from 'next-intl/server';
import type { DeviceNode } from '@/modules/topology/domain/entities';
import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import { AlarmScopeSummary } from '@/components/alarm/alarm-scope-summary';

/** Short context only. Configuration, SNMP, charts and alarms detail belong in the canvas. */
export async function Front01BdfbSummary({ node, presentation, location }: Readonly<{
  node: DeviceNode;
  presentation: BdfbPresentation;
  location: string;
}>) {
  const t = await getTranslations('front01Ui');
  const frames = presentation.shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const positions = panels.flatMap((panel) => panel.positions);
  const installed = positions.filter(Boolean).length;
  const occupiedPanels = panels.filter((panel) => panel.positions.some(Boolean)).length;
  return (
    <aside className="telxius-properties front01-compact-inspector">
      <header>INSPECTOR <span>⌄</span></header>
      <div className="zip-bdfb-inspector-id">
        <span aria-hidden="true">▥</span>
        <div><h2>{node.name}</h2><small>{location}</small></div>
      </div>
      <dl className="front01-summary-facts">
        <dt>{t('type')}</dt><dd>BDFB</dd>
        <dt>{t('location')}</dt><dd>{location || '—'}</dd>
        <dt>{t('occupiedPanels')}</dt><dd>{occupiedPanels} / {panels.length}</dd>
        <dt>{t('installedCircuits')}</dt><dd>{installed} / {positions.length}</dd>
      </dl>
      <AlarmScopeSummary entityId={node.id} scopeLabel={node.name} />
      <p className="front01-summary-note">{t('bdfbSummaryNote')}</p>
    </aside>
  );
}
