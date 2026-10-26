import type { ReactNode } from 'react';
import Image from 'next/image';

import { helpCatalog, helpScreenshotZoomTitle, type HelpLocale } from '../catalog';

function safeTarget(target: string): string | null {
  if (/^https:\/\/[^ ]+$/i.test(target)) return target;
  if (target.startsWith('#') && /^#[\w.-]+$/.test(target)) return target;
  // All relative links originate in the allowlisted docs/help directory.
  if (target.startsWith('mailto:')) return null;
  const [raw, fragment] = target.split('#', 2);
  if (!raw || raw.startsWith('/') || raw.includes(':') || raw.includes('?')) return null;
  const clean = raw.replace(/^\.\//, '');
  if (clean.startsWith('../')) return null;
  const filename = clean.split('/').pop();
  const found = helpCatalog.find((entry) => entry.file === filename);
  if (found) return '/help/' + found.slug + (fragment ? '#' + encodeURIComponent(fragment) : '');
  return null;
}

function inlineText(source: string): ReactNode[] {
  const tokens = /(\*\*[^*]+\*\*|\x60[^\x60]+\x60|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
  const result: ReactNode[] = [];
  let end = 0;
  for (const match of source.matchAll(tokens)) {
    const index = match.index ?? 0;
    if (index > end) result.push(source.slice(end, index));
    const token = match[0];
    const key = 'tok-' + index;
    if (token.startsWith('**')) {
      result.push(<strong key={key}>{inlineText(token.slice(2, -2))}</strong>);
    } else if (token.startsWith(String.fromCharCode(96))) {
      result.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const pos = token.indexOf('](');
      const label = token.slice(1, pos);
      const href = safeTarget(token.slice(pos + 2, -1));
      result.push(
        href ? (
          <a
            key={key}
            href={href}
            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          >
            {inlineText(label)}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      );
    } else {
      result.push(<em key={key}>{inlineText(token.slice(1, -1))}</em>);
    }
    end = index + token.length;
  }
  if (end < source.length) result.push(source.slice(end));
  return result;
}

function headingId(text: string): string {
  return text
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/[*\x60]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isListItem(line: string) {
  return /^\s*(?:[-*+] |\d+\. )/.test(line);
}
function isTable(line: string) {
  return /^\s*\|.+\|\s*$/.test(line);
}
function isRule(line: string) {
  return /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line);
}
function isFence(line: string) {
  return /^\s*(?:\x60{3}|~{3})/.test(line);
}
function cellContent(row: string) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((part) => part.trim());
}

/**
 * Safe Markdown subset for reviewed, end-user workflow guides. Images come only
 * from our own localized allowlist; neither HTML nor executable Mermaid is rendered.
 */
const screenshotDimensions: Readonly<Record<string, readonly [number, number]>> = {
  '/help/screenshots/workspace-overview.png': [1897, 937],
  '/help/screenshots/create-site.png': [1902, 931],
  '/help/screenshots/draw-site-boundary.png': [1907, 942],
  '/help/screenshots/create-structure.png': [1903, 931],
  '/help/screenshots/create-level.png': [1907, 935],
  '/help/screenshots/create-room.png': [1907, 937],
  '/help/screenshots/room-blueprint.png': [1913, 938],
  '/help/screenshots/place-rack.png': [1900, 927],
  '/help/screenshots/edit-room.png': [1911, 931],
  '/help/screenshots/rack-focus.png': [1908, 932],
  '/help/screenshots/rack-elevation.png': [1907, 932],
  '/help/screenshots/rack-cas.png': [1907, 935],
  '/help/screenshots/bdfb-physical.png': [1902, 946],
  '/help/screenshots/snmp-inputs.png': [1888, 927],
  '/help/screenshots/history-charts.png': [1888, 935],
  '/help/screenshots/panel-empty.png': [1900, 933],
  '/help/screenshots/panel-breakers.png': [1891, 932],
  '/help/screenshots/panel-history.png': [1883, 928],
  '/help/screenshots/breaker-live.png': [1893, 930],
  '/help/screenshots/power-path.png': [1907, 937],
};

function illustrationSize(src: string): readonly [number, number] {
  return screenshotDimensions[src] ?? [1100, 410];
}

export function MarkdownHelpArticle({ text, locale }: { text: string; locale: HelpLocale }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let serial = 0;

  while (i < lines.length) {
    const current = (lines[i] ?? '').trim();
    if (!current) {
      i++;
      continue;
    }
    const key = 'block-' + serial++;

    const illustration =
      /^!\[([^\]]{1,140})\]\((\/help\/(?:diagrams\/(?:es|en)\/(?:overview|places|rack|power|readings|mqtt|snmp|data-flow)\.svg|screenshots\/(?:workspace-overview|create-site|draw-site-boundary|create-structure|create-level|create-room|room-blueprint|place-rack|edit-room|rack-focus|rack-elevation|rack-cas|bdfb-physical|snmp-inputs|history-charts|panel-empty|panel-breakers|panel-history|breaker-live|power-path)\.png))\)$/.exec(
        current,
      );
    if (illustration) {
      const [width, height] = illustrationSize(illustration[2]!);
      const image = (
        <Image
          src={illustration[2]!}
          alt={illustration[1]!}
          width={width}
          height={height}
          unoptimized
        />
      );
      blocks.push(
        <figure className="help-illustration" key={key}>
          {illustration[2]!.startsWith('/help/screenshots/') ? (
            <a
              className="help-illustration-zoom"
              href={illustration[2]!}
              target="_blank"
              rel="noopener noreferrer"
              title={
                locale === 'es' ? 'Abrir captura a tamaño completo' : 'Open full-size screenshot'
              }
            >
              {image}
            </a>
          ) : (
            image
          )}
          <figcaption>{illustration[1]!}</figcaption>
        </figure>,
      );
      i++;
      continue;
    }

    if (isFence(current)) {
      const language = current.replace(/^[\x60~]+/, '').trim();
      const fence = current.slice(0, 3);
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(fence)) {
        code.push(lines[i] ?? '');
        i++;
      }
      i++;
      if (language === 'mermaid') {
        blocks.push(
          <p key={key}>{locale === 'es' ? 'Diagrama no disponible.' : 'Diagram unavailable.'}</p>,
        );
        continue;
      }
      blocks.push(
        <figure className="help-code" key={key}>
          {language ? <figcaption>{language}</figcaption> : null}
          <pre>
            <code>{code.join('\n')}</code>
          </pre>
        </figure>,
      );
      continue;
    }
    if (isRule(current)) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(current);
    if (heading) {
      const level = Math.min(5, heading[1]!.length + 1);
      const title = heading[2]!.trim();
      const children = inlineText(title);
      const id = headingId(title);
      blocks.push(
        level <= 2 ? (
          <h2 id={id} key={key}>
            {children}
          </h2>
        ) : level === 3 ? (
          <h3 id={id} key={key}>
            {children}
          </h3>
        ) : (
          <h4 id={id} key={key}>
            {children}
          </h4>
        ),
      );
      i++;
      continue;
    }
    if (/^>\s?/.test(current)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i] ?? '')) {
        quote.push((lines[i] ?? '').trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote key={key}>
          {quote.map((line, j) => (
            <p key={j}>{inlineText(line)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }
    if (
      isTable(current) &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? '')
    ) {
      const headers = cellContent(lines[i] ?? '');
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTable(lines[i] ?? '')) {
        rows.push(cellContent(lines[i] ?? ''));
        i++;
      }
      blocks.push(
        <div className="help-table-scroll" key={key}>
          <table>
            <thead>
              <tr>
                {headers.map((value, j) => (
                  <th key={j} scope="col">
                    {inlineText(value)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, j) => (
                <tr key={j}>
                  {headers.map((_, c) => (
                    <td key={c}>{inlineText(row[c] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (isListItem(lines[i] ?? '')) {
      const ordered = /^\s*\d+\./.test(lines[i] ?? '');
      const items: string[] = [];
      while (
        i < lines.length &&
        (isListItem(lines[i] ?? '') || ((lines[i] ?? '').trim() && /^\s{2,}/.test(lines[i] ?? '')))
      ) {
        if (isListItem(lines[i] ?? ''))
          items.push((lines[i] ?? '').replace(/^\s*(?:[-*+] |\d+\. )/, ''));
        else if (items.length) items[items.length - 1] += ' ' + (lines[i] ?? '').trim();
        i++;
      }
      const li = items.map((value, j) => <li key={j}>{inlineText(value)}</li>);
      blocks.push(ordered ? <ol key={key}>{li}</ol> : <ul key={key}>{li}</ul>);
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      !/^(?:#{1,6}\s|>\s?)/.test((lines[i] ?? '').trim()) &&
      !isFence(lines[i] ?? '') &&
      !isTable(lines[i] ?? '') &&
      !isListItem(lines[i] ?? '') &&
      !isRule(lines[i] ?? '')
    ) {
      para.push((lines[i] ?? '').trim());
      i++;
    }
    if (!para.length) {
      i++;
      continue;
    }
    blocks.push(<p key={key}>{inlineText(para.join(' '))}</p>);
  }
  return (
    <div className="help-prose" lang={locale}>
      {blocks}
    </div>
  );
}
