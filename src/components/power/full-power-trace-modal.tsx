'use client';

import { useTranslations } from 'next-intl';
import { DetachedWorkbenchButton } from '@/components/workbench/detached-workbench-button';

/**
 * Backward-compatible launch surface. The Full Power Trace is no longer a modal:
 * it opens an independent read-only workbench, just like operational reports.
 */
export function FullPowerTraceModal({
  entityId,
  selectedPathId,
  label,
}: Readonly<{ entityId: string; selectedPathId?: string; label?: string }>) {
  const t = useTranslations('fullTrace');
  const href =
    '/workbench/power-trace?entityId=' +
    encodeURIComponent(entityId) +
    (selectedPathId ? '&path=' + encodeURIComponent(selectedPathId) : '');

  return (
    <DetachedWorkbenchButton
      href={href}
      windowName={'site-mapper-power-trace-' + entityId}
      label={label ?? t('pathTitle')}
    >
      {label ?? t('pathTitle')}
    </DetachedWorkbenchButton>
  );
}
