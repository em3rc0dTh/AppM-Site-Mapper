'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { SearchResult } from '@/modules/workspace/application/search-service';

const EMPTY_STATUS = 'Type a name or ID to search.';

function glyph(kind: string) {
  if (kind.includes('RACK')) return '▥';
  if (kind.includes('DEVICE') || kind.includes('EQUIPMENT')) return '▤';
  if (kind.includes('ROOM')) return '▭';
  if (kind.includes('SITE')) return '▦';
  return '◇';
}

export function CommandPalette() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState(EMPTY_STATUS);
  const hasQuery = Boolean(query.trim());
  const visibleResults = open && hasQuery ? results : [];
  const visibleStatus = hasQuery ? status : EMPTY_STATUS;
  const groups = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const result of visibleResults) {
      const label = result.kind.replaceAll('_', ' ');
      map.set(label, [...(map.get(label) ?? []), result]);
    }
    return [...map.entries()];
  }, [visibleResults]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  useEffect(() => {
    if (!open || !hasQuery) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('Searching…');
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
        setStatus(data.results.length ? `${data.results.length} results` : 'No matching objects.');
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setStatus('Search unavailable. Try again.');
        }
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, hasQuery]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function navigate(result: SearchResult) {
    close();
    router.push(result.href);
  }

  return (
    <>
      <button ref={trigger} className="mk-search-trigger" onClick={() => setOpen(true)}>
        ⌕ <span>Search...</span>
        <kbd>⌘ K</kbd>
      </button>

      <dialog
        ref={dialog}
        className="mk-command zip-command"
        onCancel={close}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        aria-label="Global infrastructure search"
      >
        <div className="mk-command-input zip-command-input">
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus
            value={query}
            maxLength={120}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            placeholder="Search infrastructure..."
            aria-label="Search infrastructure"
            role="combobox"
            aria-expanded={open}
            aria-controls="search-results"
            aria-activedescendant={visibleResults[index] ? `result-${index}` : undefined}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setIndex((value) => Math.min(value + 1, visibleResults.length - 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setIndex((value) => Math.max(0, value - 1));
              }
              if (event.key === 'Enter' && visibleResults[index]) navigate(visibleResults[index]);
            }}
          />
          <button onClick={close} aria-label="Close search">
            ×
          </button>
        </div>

        <p role="status">{visibleStatus}</p>
        <div id="search-results" role="listbox" className="zip-command-results">
          {groups.map(([group, items]) => (
            <section className="zip-command-group" key={group}>
              <header>
                <strong>{group}</strong>
                <span>{items.length}</span>
              </header>
              {items.map((result) => {
                const resultIndex = visibleResults.findIndex(
                  (candidate) => candidate.id === result.id && candidate.kind === result.kind,
                );
                return (
                  <button
                    key={`${result.kind}-${result.id}`}
                    id={`result-${resultIndex}`}
                    role="option"
                    aria-selected={index === resultIndex}
                    className={index === resultIndex ? 'is-selected' : ''}
                    onMouseEnter={() => setIndex(resultIndex)}
                    onClick={() => navigate(result)}
                  >
                    <b className="zip-command-icon">{glyph(result.kind)}</b>
                    <span>
                      <strong>{result.name}</strong>
                      <em>{result.breadcrumb}</em>
                    </span>
                    <kbd>↵</kbd>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </dialog>
    </>
  );
}
