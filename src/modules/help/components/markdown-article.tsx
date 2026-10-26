import type { ReactNode } from 'react';

import { helpCatalog } from '../catalog';

const docsBase = 'https://github.com/em3rc0dTh/AppM-Site-Mapper/blob/main/docs/';

function safeTarget(target: string): string | null {
  if (/^https:\/\/[^ ]+$/i.test(target)) return target;
  if (target.startsWith('#') && /^#[\w.-]+$/.test(target)) return target;
  // All relative links originate in the allowlisted docs/user-guide directory.
  if (target.startsWith('mailto:')) return null;
  const [raw, fragment] = target.split('#', 2);
  if (!raw || raw.startsWith('/') || raw.includes(':') || raw.includes('?')) return null;
  const clean = raw.replace(/^\.\//, '');
  if (clean.startsWith('../')) {
    const normal = clean.split('/').reduce<string[]>((parts, part) => {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
      return parts;
    }, ['user-guide']);
    if (!normal.length || normal.some((part) => part === '..')) return null;
    return docsBase + normal.map(encodeURIComponent).join('/') +
      (fragment ? '#' + encodeURIComponent(fragment) : '');
  }
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
      result.push(href
        ? <a key={key} href={href} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>
            {inlineText(label)}
          </a>
        : <span key={key}>{label}</span>);
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((part) => part.trim());
}

/**
 * Safe Markdown subset for the existing operator guides. No raw HTML injection,
 * browser scripts, external parser or untrusted user content. Mermaid diagrams
 * are shown as accessible text until real, reviewed illustrations are available.
 */
export function MarkdownHelpArticle({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let serial = 0;

  while (i < lines.length) {
    const current = (lines[i] ?? '').trim();
    if (!current) { i++; continue; }
    const key = 'block-' + serial++;

    if (isFence(current)) {
      const language = current.replace(/^[\x60~]+/, '').trim();
      const fence = current.slice(0, 3);
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(fence)) {
        code.push((lines[i] ?? '')); i++;
      }
      i++;
      blocks.push(<figure className="help-code" key={key}>
        {language ? <figcaption>{language === 'mermaid' ? 'Diagrama conceptual · texto accesible' : language}</figcaption> : null}
        <pre><code>{code.join('\n')}</code></pre>
      </figure>);
      continue;
    }
    if (isRule(current)) { blocks.push(<hr key={key} />); i++; continue; }

    const heading = /^(#{1,6})\s+(.+)$/.exec(current);
    if (heading) {
      const level = Math.min(5, heading[1]!.length + 1);
      const title = heading[2]!.trim();
      const children = inlineText(title);
      const id = headingId(title);
      blocks.push(level <= 2
        ? <h2 id={id} key={key}>{children}</h2>
        : level === 3
          ? <h3 id={id} key={key}>{children}</h3>
          : <h4 id={id} key={key}>{children}</h4>);
      i++; continue;
    }
    if (/^>\s?/.test(current)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test((lines[i] ?? ''))) {
        quote.push((lines[i] ?? '').trim().replace(/^>\s?/, '')); i++;
      }
      blocks.push(<blockquote key={key}>{quote.map((line, j) =>
        <p key={j}>{inlineText(line)}</p>)}</blockquote>);
      continue;
    }
    if (isTable(current) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const headers = cellContent((lines[i] ?? ''));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTable((lines[i] ?? ''))) { rows.push(cellContent((lines[i] ?? ''))); i++; }
      blocks.push(<div className="help-table-scroll" key={key}><table>
        <thead><tr>{headers.map((value, j) => <th key={j} scope="col">{inlineText(value)}</th>)}</tr></thead>
        <tbody>{rows.map((row, j) => <tr key={j}>{headers.map((_, c) =>
          <td key={c}>{inlineText(row[c] ?? '')}</td>)}</tr>)}</tbody>
      </table></div>);
      continue;
    }
    if (isListItem((lines[i] ?? ''))) {
      const ordered = /^\s*\d+\./.test((lines[i] ?? ''));
      const items: string[] = [];
      while (i < lines.length && (isListItem((lines[i] ?? '')) || ((lines[i] ?? '').trim() && /^\s{2,}/.test((lines[i] ?? ''))))) {
        if (isListItem((lines[i] ?? ''))) items.push((lines[i] ?? '').replace(/^\s*(?:[-*+] |\d+\. )/, ''));
        else if (items.length) items[items.length - 1] += ' ' + (lines[i] ?? '').trim();
        i++;
      }
      const li = items.map((value, j) => <li key={j}>{inlineText(value)}</li>);
      blocks.push(ordered ? <ol key={key}>{li}</ol> : <ul key={key}>{li}</ul>);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() &&
      !/^(?:#{1,6}\s|>\s?)/.test((lines[i] ?? '').trim()) &&
      !isFence((lines[i] ?? '')) && !isTable((lines[i] ?? '')) &&
      !isListItem((lines[i] ?? '')) && !isRule((lines[i] ?? ''))) {
      para.push((lines[i] ?? '').trim()); i++;
    }
    if (!para.length) { i++; continue; }
    blocks.push(<p key={key}>{inlineText(para.join(' '))}</p>);
  }
  return <div className="help-prose" lang="es">{blocks}</div>;
}
