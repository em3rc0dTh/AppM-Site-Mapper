'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchResult } from '@/modules/workspace/application/search-service';
export function CommandPalette() {
  const router = useRouter(); const dialog = useRef<HTMLDialogElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const [open,setOpen] = useState(false); const [query,setQuery] = useState(''); const [results,setResults] = useState<SearchResult[]>([]); const [index,setIndex] = useState(0); const [status,setStatus] = useState('Type a name or ID to search.');
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(value => !value); } }; window.addEventListener('keydown',listener); return () => window.removeEventListener('keydown',listener); },[]);
  useEffect(() => { if (open) dialog.current?.showModal(); else { dialog.current?.close(); } },[open]);
  useEffect(() => {
    if (!open || !query.trim()) { setResults([]); setStatus('Type a name or ID to search.'); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => { setStatus('Searching…'); try { const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }); if (!response.ok) throw new Error(); const data = await response.json() as { results: SearchResult[] }; setResults(data.results); setIndex(0); setStatus(data.results.length ? `${data.results.length} results` : 'No matching objects.'); } catch { if (!controller.signal.aborted) { setResults([]); setStatus('Search unavailable. Try again.'); } } },180);
    return () => { clearTimeout(timer); controller.abort(); };
  },[query,open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  function navigate(result: SearchResult) { close(); router.push(result.href); }
  return <><button ref={trigger} className="mk-search-trigger" onClick={() => setOpen(true)}>⌕ <span>Search infrastructure…</span><kbd>⌘ / Ctrl K</kbd></button>
    <dialog ref={dialog} className="mk-command" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }} aria-label="Global infrastructure search">
      <div className="mk-command-input"><input autoFocus value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="Search name or ID…" aria-label="Search infrastructure" role="combobox" aria-expanded={open} aria-controls="search-results" aria-activedescendant={results[index] ? `result-${index}` : undefined} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(i => Math.min(i+1,results.length-1)); } if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(i => Math.max(0,i-1)); } if (event.key === 'Enter' && results[index]) navigate(results[index]); }} /><button onClick={close} aria-label="Close search">Esc</button></div>
      <p role="status">{status}</p><div id="search-results" role="listbox">{results.map((result,i) => <button key={`${result.kind}-${result.id}`} id={`result-${i}`} role="option" aria-selected={index === i} className={i === index ? 'is-selected' : ''} onClick={() => navigate(result)}><span><small>{result.kind.replaceAll('_',' ')}</small><strong>{result.name}</strong><em>{result.breadcrumb}</em></span><b>↵</b></button>)}</div>
    </dialog></>;
}
