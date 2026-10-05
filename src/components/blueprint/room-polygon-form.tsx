'use client';

import { useState, type FormEvent } from 'react';

const defaultPolygon = JSON.stringify(
  [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 3600 },
    { x: 0, y: 3600 },
  ],
  null,
  2,
);

export function RoomPolygonForm({ roomId }: Readonly<{ roomId: string }>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const raw = String(form.get('polygon') ?? '');

    let polygon: unknown;

    try {
      polygon = JSON.parse(raw);
    } catch {
      setError('Polygon must be valid JSON.');
      setBusy(false);
      return;
    }

    const response = await fetch(`/api/spatial/rooms/${roomId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ polygon }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? 'POLYGON_UPDATE_FAILED');
      setBusy(false);
      return;
    }

    window.location.reload();
  }

  return (
    <form className="polygon-form" onSubmit={submit}>
      <div>
        <strong>Room polygon</strong>
        <p>Physical coordinates in millimetres.</p>
      </div>
      <textarea name="polygon" defaultValue={defaultPolygon} rows={10} spellCheck={false} />
      <button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save polygon'}
      </button>
      {error && <span className="form-error">{error}</span>}
    </form>
  );
}
