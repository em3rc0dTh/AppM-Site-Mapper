import { redirect } from 'next/navigation';

import { TemplateCreateForm } from '@/components/warehouse/template-create-form';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { WarehouseService } from '@/modules/warehouse/application/warehouse-service';
import { createWarehouseRepository } from '@/modules/warehouse/infrastructure/warehouse-repository-factory';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const templates = await new WarehouseService(await createWarehouseRepository()).listActive();
  const canWrite = hasPermission(auth.value.role, 'topology:write');

  return (
    <main className="warehouse-page">
      <header className="warehouse-heading">
        <div>
          <span>VIRTUAL WAREHOUSE</span>
          <h1>Device & Equipment Templates</h1>
          <p>
            Define reusable hardware once. Rack inventory instances keep their own identity and a
            versioned snapshot of the template used to create them.
          </p>
        </div>
        <strong>{templates.length} active templates</strong>
      </header>

      {canWrite && (
        <section className="warehouse-create-card">
          <h2>Create template</h2>
          <TemplateCreateForm />
        </section>
      )}

      <section className="warehouse-template-grid" aria-label="Warehouse templates">
        {templates.length ? (
          templates.map((template) => (
            <article key={template.id} className="warehouse-template-card">
              <header>
                <span>
                  {template.kind}
                  {template.deviceType ? ` · ${template.deviceType}` : ''}
                </span>
                <b>v{template.version}</b>
              </header>
              <h2>{template.name}</h2>
              <p>
                {[template.manufacturer, template.model].filter(Boolean).join(' · ') ||
                  'Manufacturer/model not defined'}
              </p>
              <dl>
                <dt>Category</dt>
                <dd>{template.category ?? '—'}</dd>
                <dt>Profile</dt>
                <dd>{template.deviceType ?? 'Generic'}</dd>
                <dt>Rack size</dt>
                <dd>{template.sizeU ? `${template.sizeU}U` : '—'}</dd>
                <dt>Dimensions</dt>
                <dd>
                  {template.dimensionsMm
                    ? `${template.dimensionsMm.width} × ${template.dimensionsMm.depth} mm`
                    : '—'}
                </dd>
              </dl>
              {template.notes && <small>{template.notes}</small>}
            </article>
          ))
        ) : (
          <div className="warehouse-empty">
            <strong>No templates yet</strong>
            <p>Create the first reusable Device or Equipment template above.</p>
          </div>
        )}
      </section>
    </main>
  );
}
