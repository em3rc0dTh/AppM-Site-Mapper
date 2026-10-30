'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { AlarmSnapshotView } from '@/modules/alarms/domain/entities';

export function AlarmTopbarLink() {
  const [snapshot, setSnapshot] = useState<AlarmSnapshotView | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      void fetch('/api/alarms', { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return null;
          return response.json() as Promise<AlarmSnapshotView>;
        })
        .then((payload) => {
          if (!controller.signal.aborted) setSnapshot(payload);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSnapshot(null);
        });
    };

    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  const count = snapshot?.occurrences.filter((item) => item.state === 'ACTIVE').length ?? 0;
  const critical = snapshot?.occurrences.filter(
    (item) => item.state === 'ACTIVE' && item.severity === 'CRITICAL',
  ).length ?? 0;

  return (
    <Link
      className="alarm-topbar-link"
      data-active={count > 0}
      href="/alarms"
      aria-label={count ? `${count} active alarms` : 'Alarm Center'}
    >
      <span aria-hidden="true">⚠</span>
      <strong>ALARMS</strong>
      {count > 0 ? <b>{count}</b> : null}
      {critical > 0 ? <i aria-label={`${critical} critical`}>● {critical}</i> : null}
    </Link>
  );
}
