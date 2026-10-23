import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { defaultLocale, isSupportedLocale, locales } from '@/i18n/locales';

function leaves(value: Record<string, unknown>, parent = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, current] of Object.entries(value)) {
    const path = parent ? `${parent}.${key}` : key;
    if (typeof current === 'string') {
      result.set(path, current);
    } else if (current && typeof current === 'object' && !Array.isArray(current)) {
      for (const [nestedKey, nestedValue] of leaves(current as Record<string, unknown>, path)) {
        result.set(nestedKey, nestedValue);
      }
    } else {
      throw new Error(`Message ${path} must be a string or namespace`);
    }
  }
  return result;
}

describe('Site Mapper translation catalogs', () => {
  it('uses English by default and accepts only explicit en/es preferences', () => {
    expect(defaultLocale).toBe('en');
    expect(isSupportedLocale('pt')).toBe(false);
    expect(locales).toEqual(['en', 'es']);
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('es')).toBe(true);
    expect(isSupportedLocale('en<script>')).toBe(false);
  });

  it('keeps exactly the same semantic keys in both catalogs', () => {
    const english = leaves(en);
    const spanish = leaves(es);
    expect([...spanish.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, value] of english) {
      expect(value.trim(), key).not.toBe('');
      expect(spanish.get(key)?.trim(), key).toBeTruthy();
      const enVariables = [...value.matchAll(/\{([a-zA-Z][\w]*)\}/g)].map((match) => match[1]);
      const esVariables = [...(spanish.get(key) ?? '').matchAll(/\{([a-zA-Z][\w]*)\}/g)].map(
        (match) => match[1],
      );
      expect(esVariables.sort(), key).toEqual(enVariables.sort());
    }
  });

  it('never includes physical identifiers in presentation catalogs', () => {
    for (const catalog of [en, es]) {
      const values = [...leaves(catalog).values()].join(' ');
      for (const literal of ['EMU-DELTA-BFDB-01', '0_1_1', '1.3.6.1.4.1.8072']) {
        expect(values).not.toContain(literal);
      }
    }
  });
});
