'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PowerSource {
  readonly entityId: string;
  readonly deviceName: string;
  readonly shelfId: string;
  readonly shelfLabel: string;
  readonly frameId: string;
  readonly frameLabel: string;
  readonly panelId: string;
  readonly panelLabel: string;
  readonly breakerId: string;
  readonly breakerLabel: string;
  readonly capacity?: number;
}

interface DestinationOption {
  readonly id: string;
  readonly name: string;
  readonly kind: 'DEVICE' | 'EQUIPMENT';
  readonly context: string;
  readonly category?: string;
  readonly serialNumber?: string;
}

export function ConnectPowerForm({
  source,
  destinations,
  returnHref,
}: Readonly<{
  source: PowerSource;
  destinations: readonly DestinationOption[];
  returnHref: string;
}>) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [feed, setFeed] = useState<'A' | 'B'>('A');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleDestinations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return destinations;
    return destinations.filter((item) =>
      [item.name, item.kind, item.context, item.category, item.serialNumber]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [destinations, query]);

  async function connect() {
    if (!destinationId || saving) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/power-paths', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: {
            entityId: source.entityId,
            internal: {
              shelfId: source.shelfId,
              frameId: source.frameId,
              panelId: source.panelId,
              breakerHolderId: source.breakerId,
            },
          },
          target: { entityId: destinationId },
          feed,
          ...(label.trim() ? { label: label.trim() } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        path?: { id?: string };
        error?: string;
      } | null;

      if (!response.ok || !payload?.path?.id) {
        setError(payload?.error ?? `Unable to create power path (HTTP ${response.status}).`);
        return;
      }

      router.push(
        `/power?path=${encodeURIComponent(payload.path.id)}&breaker=${encodeURIComponent(source.breakerId)}&feed=${feed}`,
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="power-connect-page">
      <header className="power-connect-header">
        <div>
          <p>POWER / COMMISSIONING</p>
          <h1>Connect power</h1>
          <span>Choose the physical destination for this breaker. No IDs need to be typed.</span>
        </div>
        <Link href={returnHref}>← Back to breaker</Link>
      </header>

      <div className="power-connect-layout">
        <section className="power-connect-source">
          <div className="power-connect-step">
            <span>1</span>
            <div>
              <strong>Source</strong>
              <small>Fixed from the breaker you selected</small>
            </div>
          </div>

          <article className="power-source-card">
            <div className="power-source-icon">ϟ</div>
            <div>
              <small>BDFB</small>
              <strong>{source.deviceName}</strong>
              <p>
                {source.shelfLabel} / {source.frameLabel} / {source.panelLabel}
              </p>
            </div>
            <dl>
              <div>
                <dt>Breaker</dt>
                <dd>{source.breakerLabel}</dd>
              </div>
              <div>
                <dt>Capacity</dt>
                <dd>{source.capacity === undefined ? 'Not specified' : `${source.capacity} A`}</dd>
              </div>
            </dl>
          </article>

          <div className="power-connect-step">
            <span>2</span>
            <div>
              <strong>Destination</strong>
              <small>Select the Device or Equipment physically fed by this breaker</small>
            </div>
          </div>

          <label className="power-destination-search">
            <span>Search inventory</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, serial, type or location..."
            />
          </label>

          <div className="power-destination-list" role="radiogroup" aria-label="Power destination">
            {visibleDestinations.map((item) => (
              <label
                key={item.id}
                className="power-destination-option"
                data-selected={destinationId === item.id ? 'true' : 'false'}
              >
                <input
                  type="radio"
                  name="destination"
                  value={item.id}
                  checked={destinationId === item.id}
                  onChange={() => setDestinationId(item.id)}
                />
                <span className="power-destination-glyph">
                  {item.kind === 'DEVICE' ? '▤' : '▥'}
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.kind} {item.category ? `· ${item.category}` : ''}
                  </small>
                  <em>{item.context || 'No physical context available'}</em>
                </span>
                {item.serialNumber ? <code>{item.serialNumber}</code> : null}
              </label>
            ))}
            {!visibleDestinations.length ? (
              <div className="power-connect-empty">No matching Device or Equipment.</div>
            ) : null}
          </div>
        </section>

        <aside className="power-connect-summary">
          <div className="power-connect-step">
            <span>3</span>
            <div>
              <strong>Feed</strong>
              <small>Assign the electrical feed identity</small>
            </div>
          </div>

          <div className="power-feed-choice">
            {(['A', 'B'] as const).map((value) => (
              <button
                type="button"
                key={value}
                data-selected={feed === value ? 'true' : 'false'}
                onClick={() => setFeed(value)}
              >
                <span>FEED {value}</span>
                <strong>{feed === value ? '● Selected' : '○ Select'}</strong>
              </button>
            ))}
          </div>

          <label className="power-path-label">
            <span>
              Connection label <small>Optional</small>
            </span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={feed === 'A' ? 'Primary feed' : 'Secondary feed'}
            />
          </label>

          <section className="power-connect-review">
            <h2>Connection preview</h2>
            <div>
              <span>{source.deviceName}</span>
              <b>→</b>
              <span>{source.panelLabel}</span>
              <b>→</b>
              <span>{source.breakerLabel}</span>
              <b>→</b>
              <span>
                {destinations.find((item) => item.id === destinationId)?.name ??
                  'Select destination'}
              </span>
            </div>
            <dl>
              <dt>Feed</dt>
              <dd>{feed}</dd>
              <dt>Status after save</dt>
              <dd>Configured</dd>
            </dl>
          </section>

          {error ? <p className="power-connect-error">{error}</p> : null}

          <div className="power-connect-actions">
            <Link href={returnHref}>Cancel</Link>
            <button type="button" disabled={!destinationId || saving} onClick={connect}>
              {saving ? 'Connecting…' : 'CONNECT POWER'}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
