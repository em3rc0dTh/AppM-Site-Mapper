'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface PowerSource {
  readonly entityId: string;
  readonly accessPortId: string;
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
  readonly feed?: 'A' | 'B';
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

interface CommissioningCandidate {
  readonly key: string;
  readonly destinationId: string;
  readonly accessPortId: string;
  readonly feed: 'A' | 'B';
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
  const t = useTranslations('connectPower');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [accessPortId, setAccessPortId] = useState('');
  const [feed, setFeed] = useState<'A' | 'B'>(source.feed ?? 'A');
  const [label, setLabel] = useState('');
  const [candidates, setCandidates] = useState<readonly CommissioningCandidate[]>([]);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState('');
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
  const selectedCandidate = candidates.find((candidate) => candidate.key === selectedCandidateKey);

  function candidateDetails(candidate: CommissioningCandidate) {
    const destination = destinations.find((item) => item.id === candidate.destinationId);
    const port = destination?.ports.find((item) => item.id === candidate.accessPortId);
    return { destination, port };
  }

  function selectPort(item: DestinationOption, port: DestinationPort) {
    const nextFeed = port.feed ?? source.feed ?? feed;
    setDestinationId(item.id);
    setAccessPortId(port.id);
    setFeed(nextFeed);
    setError(null);
  }

  function selectFeed(value: 'A' | 'B') {
    if (source.feed && source.feed !== value) return;
    setFeed(value);

    if (!selectedDestination) return;
    if (!selectedPort?.feed || selectedPort.feed === value) return;

    const compatible = selectedDestination.ports.find((port) => !port.feed || port.feed === value);
    setAccessPortId(compatible?.id ?? '');
  }

  function addCandidate() {
    if (!selectedDestination || !selectedPort) {
      setError('Select a destination POWER port before adding a candidate.');
      return;
    }
    const candidateFeed = selectedPort.feed ?? source.feed ?? feed;
    if (source.feed && candidateFeed !== source.feed) {
      setError(
        `This breaker belongs to Feed ${source.feed}; choose a compatible destination port.`,
      );
      return;
    }

    const key = `${selectedDestination.id}:${selectedPort.id}:${candidateFeed}`;
    const existing = candidates.find((candidate) => candidate.key === key);
    if (existing) {
      setSelectedCandidateKey(existing.key);
      setError(null);
      return;
    }

    const candidate: CommissioningCandidate = {
      key,
      destinationId: selectedDestination.id,
      accessPortId: selectedPort.id,
      feed: candidateFeed,
    };
    setCandidates((current) => [...current, candidate]);
    setSelectedCandidateKey(key);
    setError(null);
  }

  function removeCandidate(key: string) {
    setCandidates((current) => current.filter((candidate) => candidate.key !== key));
    if (selectedCandidateKey === key) setSelectedCandidateKey('');
  }

  async function connect() {
    if (!selectedCandidate || saving) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/power-paths', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceAccessPortId: source.accessPortId,
          targetAccessPortId: selectedCandidate.accessPortId,
          feed: selectedCandidate.feed,
          ...(label.trim() ? { label: label.trim() } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        path?: { id?: string };
        error?: string;
      } | null;

      if (!response.ok || !payload?.path?.id) {
        const message =
          payload?.error === 'TARGET_ALREADY_CONNECTED'
            ? 'That physical POWER input is already connected. Choose another candidate.'
            : payload?.error === 'FEED_MISMATCH'
              ? 'The selected target port belongs to the other electrical feed.'
              : payload?.error;
        setError(message ?? `Unable to create power path (HTTP ${response.status}).`);
        return;
      }

      router.push(
        `/power?path=${encodeURIComponent(payload.path.id)}&breaker=${encodeURIComponent(source.breakerId)}&feed=${selectedCandidate.feed}`,
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
          <p>{t('header')}</p>
          <h1>{t('title')}</h1>
          <span>{t('intro')}</span>
        </div>
        <Link href={returnHref}>{t('back')}</Link>
      </header>

      <div className="power-connect-layout">
        <section className="power-connect-source">
          <div className="power-connect-step">
            <span>1</span>
            <div>
              <strong>{t('source')}</strong>
              <small>{t('sourceFixed')}</small>
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
                <dt>{t('breaker')}</dt>
                <dd>{source.breakerLabel}</dd>
              </div>
              <div>
                <dt>{t('capacity')}</dt>
                <dd>
                  {source.capacity === undefined ? t('notSpecified') : `${source.capacity} A`}
                </dd>
              </div>
              <div>
                <dt>{t('physicalFeed')}</dt>
                <dd>{source.feed ?? t('notDeclared')}</dd>
              </div>
            </dl>
          </article>

          <div className="power-connect-step">
            <span>2</span>
            <div>
              <strong>{t('candidatePorts')}</strong>
              <small>{t('evaluate')}</small>
            </div>
          </div>

          <label className="power-destination-search">
            <span>{t('search')}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
            />
          </label>

          <div className="power-destination-list" role="radiogroup" aria-label={t('candidate')}>
            {visibleDestinations.flatMap((item) =>
              item.ports.map((port) => {
                const selected = destinationId === item.id && accessPortId === port.id;
                const incompatible = Boolean(source.feed && port.feed && source.feed !== port.feed);
                return (
                  <label
                    key={`${item.id}:${port.id}`}
                    className="power-destination-option"
                    data-selected={selected ? 'true' : 'false'}
                    aria-disabled={incompatible}
                  >
                    <input
                      type="radio"
                      name="destination-port"
                      value={`${item.id}:${port.id}`}
                      checked={selected}
                      disabled={incompatible}
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
                      <em>{item.context || t('noContext')}</em>
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

          <button
            type="button"
            className="power-connect-candidate-add"
            disabled={!destinationId || !accessPortId}
            onClick={addCandidate}
          >
            + ADD CANDIDATE
          </button>
        </section>

        <aside className="power-connect-summary">
          <div className="power-connect-step">
            <span>3</span>
            <div>
              <strong>{t('feed')}</strong>
              <small>
                {source.feed
                  ? `Locked by physical source: Feed ${source.feed}`
                  : 'Assign the electrical feed identity'}
              </small>
            </div>
          </div>

          <div className="power-feed-choice">
            {(['A', 'B'] as const).map((value) => (
              <button
                type="button"
                key={value}
                disabled={Boolean(source.feed && source.feed !== value)}
                data-selected={feed === value ? 'true' : 'false'}
                onClick={() => selectFeed(value)}
              >
                <span>FEED {value}</span>
                <strong>{feed === value ? t('selected') : t('select')}</strong>
              </button>
            ))}
          </div>

          <section className="power-connect-review">
            <h2>{t('candidates')}</h2>
            <p>
              Candidates are drafts only. They do not appear in Full Power Trace until one is
              confirmed.
            </p>
            {candidates.length ? (
              <div className="power-candidate-list">
                {candidates.map((candidate) => {
                  const details = candidateDetails(candidate);
                  return (
                    <label
                      key={candidate.key}
                      className="power-destination-option"
                      data-selected={selectedCandidateKey === candidate.key ? 'true' : 'false'}
                    >
                      <input
                        type="radio"
                        name="confirmed-candidate"
                        checked={selectedCandidateKey === candidate.key}
                        onChange={() => setSelectedCandidateKey(candidate.key)}
                      />
                      <span>
                        <strong>{details.destination?.name ?? candidate.destinationId}</strong>
                        <small>
                          {details.port?.label ?? candidate.accessPortId} · FEED {candidate.feed}
                        </small>
                      </span>
                      <button type="button" onClick={() => removeCandidate(candidate.key)}>
                        REMOVE
                      </button>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="power-connect-empty">{t('noCandidates')}</div>
            )}
          </section>

          <label className="power-path-label">
            <span>
              {t('connectionLabel')} <small>{t('optional')}</small>
            </span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={selectedCandidate?.feed === 'B' ? 'Secondary feed' : 'Primary feed'}
            />
          </label>

          <section className="power-connect-review">
            <h2>{t('confirm')}</h2>
            {selectedCandidate ? (
              (() => {
                const details = candidateDetails(selectedCandidate);
                return (
                  <>
                    <div>
                      <span>{source.deviceName}</span>
                      <b>→</b>
                      <span>{source.panelLabel}</span>
                      <b>→</b>
                      <span>{source.breakerLabel}</span>
                      <b>→</b>
                      <span>{details.destination?.name ?? selectedCandidate.destinationId}</span>
                      <b>→</b>
                      <span>{details.port?.label ?? selectedCandidate.accessPortId}</span>
                    </div>
                    <dl>
                      <dt>{t('feed')}</dt>
                      <dd>{selectedCandidate.feed}</dd>
                      <dt>{t('status')}</dt>
                      <dd>{t('connected')}</dd>
                    </dl>
                  </>
                );
              })()
            ) : (
              <div className="power-connect-empty">{t('choose')}</div>
            )}
          </section>

          {error ? <p className="power-connect-error">{error}</p> : null}

          <div className="power-connect-actions">
            <Link href={returnHref}>{t('cancel')}</Link>
            <button type="button" disabled={!selectedCandidate || saving} onClick={connect}>
              {saving ? t('connecting') : t('submit')}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
