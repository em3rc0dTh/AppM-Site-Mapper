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

interface DestinationPort {
  readonly id: string;
  readonly label: string;
  readonly feed?: 'A' | 'B';
}

interface DestinationOption {
  readonly id: string;
  readonly name: string;
  readonly kind: 'DEVICE' | 'EQUIPMENT';
  readonly context: string;
  readonly category?: string;
  readonly serialNumber?: string;
  readonly ports: readonly DestinationPort[];
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
  const [accessPortId, setAccessPortId] = useState('');
  const [feed, setFeed] = useState<'A' | 'B'>('A');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleDestinations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return destinations;
    return destinations.filter((item) =>
      [
        item.name,
        item.kind,
        item.context,
        item.category,
        item.serialNumber,
        ...item.ports.flatMap((port) => [port.id, port.label, port.feed]),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [destinations, query]);

  const selectedDestination = destinations.find((item) => item.id === destinationId);
  const selectedPort = selectedDestination?.ports.find((port) => port.id === accessPortId);

  function selectPort(item: DestinationOption, port: DestinationPort) {
    setDestinationId(item.id);
    setAccessPortId(port.id);
    if (port.feed) setFeed(port.feed);
  }

  async function connect() {
    if (!destinationId || !accessPortId || saving) return;
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
          target: {
            entityId: destinationId,
            internal: { accessPortId },
          },
          feed,
          ...(label.trim() ? { label: label.trim() } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { path?: { id?: string }; error?: string }
        | null;

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
          <span>Choose the exact POWER access port fed by this breaker.</span>
        </div>
        <Link href={returnHref}>← Back to breaker</Link>
      </header>

      <div className="power-connect-layout">
        <section className="power-connect-source">
          <div className="power-connect-step">
            <span>1</span>
            <div>
              <strong>Source circuit</strong>
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
              <strong>Destination POWER port</strong>
              <small>Select a Device or recursively nested Equipment access port</small>
            </div>
          </div>

          <label className="power-destination-search">
            <span>Search inventory or port</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, serial, location or power port..."
            />
          </label>

          <div className="power-destination-list" role="radiogroup" aria-label="Power destination port">
            {visibleDestinations.flatMap((item) =>
              item.ports.map((port) => {
                const selected = destinationId === item.id && accessPortId === port.id;
                return (
                  <label
                    key={`${item.id}:${port.id}`}
                    className="power-destination-option"
                    data-selected={selected ? 'true' : 'false'}
                  >
                    <input
                      type="radio"
                      name="destination-port"
                      value={`${item.id}:${port.id}`}
                      checked={selected}
                      onChange={() => selectPort(item, port)}
                    />
                    <span className="power-destination-glyph">
                      {item.kind === 'DEVICE' ? '▤' : '▥'}
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.kind} · {port.label}
                        {port.feed ? ` · FEED ${port.feed}` : ''}
                      </small>
                      <em>{item.context || 'No physical context available'}</em>
                    </span>
                    <code>{port.id}</code>
                  </label>
                );
              }),
            )}
            {!visibleDestinations.some((item) => item.ports.length) ? (
              <div className="power-connect-empty">
                No matching POWER access ports. Configure the destination power contract first.
              </div>
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
                disabled={Boolean(selectedPort?.feed && selectedPort.feed !== value)}
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
              <span>{selectedDestination?.name ?? 'Select destination'}</span>
              <b>→</b>
              <span>{selectedPort?.label ?? 'Select POWER port'}</span>
            </div>
            <dl>
              <dt>Feed</dt>
              <dd>{feed}</dd>
              <dt>Target port</dt>
              <dd>{selectedPort?.id ?? 'Not selected'}</dd>
              <dt>Status after save</dt>
              <dd>Configured</dd>
            </dl>
          </section>

          {error ? <p className="power-connect-error">{error}</p> : null}

          <div className="power-connect-actions">
            <Link href={returnHref}>Cancel</Link>
            <button
              type="button"
              disabled={!destinationId || !accessPortId || saving}
              onClick={connect}
            >
              {saving ? 'Connecting…' : 'CONNECT POWER'}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
