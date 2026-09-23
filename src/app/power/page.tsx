import { redirect } from 'next/navigation';

import { requirePermission } from '@/modules/identity/application/current-session';
import type { PowerEndpoint } from '@/modules/power/domain/entities';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';

function endpointLabel(endpoint: PowerEndpoint) {
  const internal = endpoint.internal ? Object.values(endpoint.internal).filter(Boolean) : [];

  return internal.length > 0 ? `${endpoint.entityId} / ${internal.join(' / ')}` : endpoint.entityId;
}

export default async function PowerPage() {
  const auth = await requirePermission('power:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const paths = await (await createPowerRepository()).listActive();

  return (
    <main>
      <p className="eyebrow">Electrical topology</p>
      <h1>Power Paths</h1>
      <p>Explicit source-to-target relationships. The visualization never defines the domain.</p>

      {paths.length === 0 ? (
        <p>No active Power Paths.</p>
      ) : (
        <ul>
          {paths.map((path) => (
            <li key={path.id}>
              <strong>{path.label ?? path.id}</strong>
              {' · '}
              {path.feed ? `Feed ${path.feed} · ` : ''}
              {endpointLabel(path.source)} → {endpointLabel(path.target)}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
