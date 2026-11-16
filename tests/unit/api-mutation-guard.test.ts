import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from '@/proxy';

describe('API mutation security boundary', () => {
  it('rejects cross-site writes for APIs not guarded by individual handlers', () => {
    const request = new NextRequest('https://sitemapper.example/api/settings/profile', {
      method: 'PATCH',
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://external.example' },
      body: JSON.stringify({ displayName: 'Unsafe' }),
    });
    const response = proxy(request);
    expect(response.status).toBe(403);
  });

  it('rejects declared oversized payloads before reaching application routes', () => {
    const request = new NextRequest('https://sitemapper.example/api/power-paths', {
      method: 'POST',
      headers: { 'content-length': '1048577', origin: 'https://sitemapper.example' },
      body: '{}',
    });
    expect(proxy(request).status).toBe(413);
  });

  it('permits a normal same-origin API mutation to reach its handler', () => {
    const request = new NextRequest('https://sitemapper.example/api/power-paths', {
      method: 'POST',
      headers: { origin: 'https://sitemapper.example' },
      body: '{}',
    });
    expect(proxy(request).status).toBe(200);
  });
});
