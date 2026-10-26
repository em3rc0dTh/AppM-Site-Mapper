import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { helpCatalog, type HelpEntry, type HelpLocale } from './catalog';

/** Trusted, fixed filenames: route params must NEVER reach fs APIs. */
export async function readHelpArticle(item: HelpEntry, locale: HelpLocale): Promise<string> {
  return readFile(
    path.join(process.cwd(), 'docs', 'user-guide', ...(locale === 'en' ? ['en'] : []), item.file),
    'utf8',
  );
}

function fold(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export type IndexedHelpEntry = HelpEntry & { searchText: string };

export async function getHelpSearchIndex(locale: HelpLocale): Promise<IndexedHelpEntry[]> {
  const items = await Promise.all(
    helpCatalog.map(async (entry) => {
      const text = await readHelpArticle(entry, locale);
      const plain = text
        .replace(/~~~[\s\S]*?~~~/g, ' ')
        .replace(/\x60{3}[\s\S]*?\x60{3}/g, ' ')
        .replace(/[|#*>\[\]()]/g, ' ')
        .replace(/\s+/g, ' ');
      return {
        ...entry,
        searchText: fold(
          [
            entry.title,
            entry.enTitle,
            entry.summary,
            entry.enSummary,
            entry.keywords.join(' '),
            plain,
          ].join(' '),
        ),
      };
    }),
  );
  return items;
}
