import { redirect } from 'next/navigation';

import { TemplateCreateForm } from '@/components/warehouse/template-create-form';
import { WarehouseTemplateCatalog } from '@/components/warehouse/warehouse-template-catalog';
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
          <h1>Equipment Templates</h1>
          <p>
            Define reusable physical equipment once. Device identities belong to Topology; each
            Equipment instance keeps its own identity and a versioned snapshot of the template used
            to create it.
          </p>
        </div>
        <strong>{templates.length} active templates</strong>
      </header>

      {canWrite && (
        <details className="warehouse-create-card">
          <summary>Create Equipment template</summary>
          <div className="warehouse-create-body">
            <TemplateCreateForm />
          </div>
        </details>
      )}

      {templates.length ? (
        <WarehouseTemplateCatalog templates={templates} />
      ) : (
        <section className="warehouse-template-grid" aria-label="Equipment templates">
          <div className="warehouse-empty">
            <strong>No templates yet</strong>
            <p>Create the first reusable Equipment template above.</p>
          </div>
        </section>
      )}
    </main>
  );
}
