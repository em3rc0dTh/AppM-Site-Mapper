import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { AlarmScopeSummary } from '@/components/alarm/alarm-scope-summary';

export function Front01EquipmentSummary({ equipment, location }: Readonly<{
  equipment: EquipmentNode;
  location: string;
}>) {
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
        <dt>Identidad</dt><dd>{equipment.name}</dd>
        <dt>Tipo</dt><dd>{equipment.equipmentType.replaceAll('_', ' ')}</dd>
        <dt>Ubicación</dt><dd>{location || '—'}</dd>
        {capacity !== null && <><dt>Ocupación</dt><dd>{installed} / {capacity}</dd></>}
      </dl>
      <AlarmScopeSummary entityId={equipment.id} scopeLabel={equipment.name} />
      <p className="front01-summary-note">Resumen, entradas, gráficas y alarmas están en Operación. Puertos y configuración están en Mantenimiento.</p>
    </section>
  );
}
