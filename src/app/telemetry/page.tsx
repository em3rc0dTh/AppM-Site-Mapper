import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LiveTelemetry } from '@/components/telemetry/live-telemetry';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';

export const dynamic = 'force-dynamic';

export default async function TelemetryPage() {
  const auth = await requirePermission('telemetry:read');

  if (!auth.ok) {
    redirect('/login');
  }

  return (
    <>
      {hasPermission(auth.value.role, 'settings:read') && (
        <nav style={{ padding: '16px 24px 0' }} aria-label="Industrial commissioning">
          <Link href="/industrial/commissioning">
            Configuración Acrel · Comunicaciones, canales y trazabilidad
          </Link>
        </nav>
      )}
      <LiveTelemetry />
    </>
  );
}
