'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AlarmAcknowledgeButton({
  alarmId,
  acknowledged,
}: {
  alarmId: string;
  acknowledged: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (acknowledged) {
    return <span className="alarm-acknowledged">✓ ACKNOWLEDGED</span>;
  }

  return (
    <div className="alarm-ack-action">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              'Acknowledge this alarm? Acknowledgement confirms that the alarm was seen; it does not resolve the condition.',
            )
          ) {
            return;
          }
          setBusy(true);
          setError('');
          try {
            const response = await fetch(`/api/alarms/${alarmId}/ack`, { method: 'POST' });
            if (!response.ok) {
              const body = (await response.json().catch(() => null)) as { error?: string } | null;
              throw new Error(body?.error ?? `HTTP_${response.status}`);
            }
            router.refresh();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'ACK_FAILED');
            setBusy(false);
          }
        }}
      >
        {busy ? 'ACKNOWLEDGING…' : 'ACKNOWLEDGE'}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
