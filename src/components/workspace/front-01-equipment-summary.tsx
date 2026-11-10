import { getTranslations } from 'next-intl/server';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { AlarmScopeSummary } from '@/components/alarm/alarm-scope-summary';

export async function Front01EquipmentSummary({ equipment, location }: Readonly<{
  equipment: EquipmentNode;
  location: string;
}>) {
  const t = await getTranslations('front01Ui');
  const positional = equipment.childMode === 'POSITIONAL';
  const capacity = positional ? equipment.children.length : null;
  const installed = positional ? equipment.children.filter((item) => item !== null).length : null;
  return (
    <section className="front01-equipment-summary">
      <div className="zip-device-identity">
        <span aria-hidden="true">▥</span>
        <div><h2>{equipment.name}</h2><small>{equipment.equipmentType.replaceAll('_', ' ')}</small></div>
      </div>
      <dl className="front01-summary-facts">
        <dt>{t('identity')}</dt><dd>{equipment.name}</dd>
        <dt>{t('type')}</dt><dd>{equipment.equipmentType.replaceAll('_', ' ')}</dd>
        <dt>{t('location')}</dt><dd>{location || '—'}</dd>
        {capacity !== null && <><dt>{t('occupancy')}</dt><dd>{installed} / {capacity}</dd></>}
      </dl>
      <AlarmScopeSummary entityId={equipment.id} scopeLabel={equipment.name} />
      <p className="front01-summary-note">{t('equipmentSummaryNote')}</p>
    </section>
  );
}
