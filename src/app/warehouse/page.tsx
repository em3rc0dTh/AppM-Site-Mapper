import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

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

  const t = await getTranslations('pages.warehouse');
  return (
    <main className="warehouse-page">
      <header className="warehouse-heading">
        <div>
          <span>{t('tag')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
        <strong>{t('count', { count: templates.length })}</strong>
      </header>

      {canWrite && (
        <details className="warehouse-create-card">
          <summary>{t('create')}</summary>
          <div className="warehouse-create-body">
            <TemplateCreateForm />
          </div>
        </details>
      )}

      {templates.length ? (
        <WarehouseTemplateCatalog templates={templates} />
      ) : (
        <section className="warehouse-template-grid" aria-label={t('templates')}>
          <div className="warehouse-empty">
            <strong>{t('empty')}</strong>
            <p>{t('emptyDescription')}</p>
          </div>
        </section>
      )}
    </main>
  );
}
