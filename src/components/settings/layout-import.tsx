'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { validateLayoutDraft } from '@/modules/spatial/domain/layout-draft';
export function LayoutImport() {
  const t = useTranslations('forms.import');
  const [roomId, setRoomId] = useState('');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <section>
      <h2>{t('title')}</h2>
      <p>
        {t('help')}
      </p>
      <label>
        {t('roomId')}
        <input
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <button
        disabled={!roomId || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch(`/api/spatial/rooms/${encodeURIComponent(roomId)}/layout`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setText(JSON.stringify(d.draft, null, 2));
            setMessage(t('loaded'));
            setConfirmed(false);
          } catch (e) {
            setMessage(t('loadFailed'));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('load')}
      </button>
      <textarea
        aria-label={t('json')}
        rows={18}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setConfirmed(false);
        }}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
      />
      <button
        onClick={() => {
          try {
            const error = validateLayoutDraft(JSON.parse(text));
            setMessage(
              error ??
                t('valid'),
            );
            setConfirmed(!error);
          } catch {
            setMessage(t('invalid'));
            setConfirmed(false);
          }
        }}
      >
        {t('validate')}
      </button>
      <button
        disabled={!confirmed || busy || !roomId}
        onClick={async () => {
          if (
            !window.confirm(
              t('confirm'),
            )
          )
            return;
          setBusy(true);
          try {
            const r = await fetch(`/api/spatial/rooms/${encodeURIComponent(roomId)}/layout`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: text,
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setText(JSON.stringify(d.draft, null, 2));
            setMessage(t('saved'));
            setConfirmed(false);
          } catch (e) {
            setMessage(t('importFailed'));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('submit')}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
