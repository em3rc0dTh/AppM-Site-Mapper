import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { LiveTelemetry } from '@/components/telemetry/live-telemetry';
import { IndustrialSignalExplorer } from '@/components/telemetry/industrial-signal-explorer';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';

export const dynamic = 'force-dynamic';

export default async function TelemetryPage() {
  const auth = await requirePermission('telemetry:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const t = await getTranslations('pages.telemetry');

  return (
    <>
      {hasPermission(auth.value.role, 'settings:read') && (
        <nav style={{ padding: '16px 24px 0' }} aria-label={t('mk1_industrial_commissioning')}>
          <Link href="/industrial/commissioning">
            {t('mk1_acrel_configuration_communications_channels_and_traceability')}{' '}
          </Link>
        </nav>
      )}
      <LiveTelemetry />
      <IndustrialSignalExplorer />
    </>
  );
}
