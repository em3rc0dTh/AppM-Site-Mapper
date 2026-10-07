import { describe, expect, it } from 'vitest';

import {
  isSafeMutationRequest,
  readBoundedJson,
} from '@/shared/http/request-security';

function jsonRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('https://site-mapper.example/api/test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
  });
}

describe('request security', () => {
  it('accepts bounded same-origin JSON', async () => {
    const request = jsonRequest('{"name":"Panel A1"}', {
      origin: 'https://site-mapper.example',
      'sec-fetch-site': 'same-origin',
    });

    expect(isSafeMutationRequest(request)).toBe(true);
    await expect(readBoundedJson(request)).resolves.toEqual({
      ok: true,
      value: { name: 'Panel A1' },
    });
  });

  it('rejects cross-site cookie-authenticated mutations', () => {
    expect(
      isSafeMutationRequest(
        jsonRequest('{}', {
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
        }),
      ),
    ).toBe(false);
  });

  it('rejects oversized, deep and structurally complex JSON', async () => {
    await expect(
      readBoundedJson(jsonRequest(JSON.stringify({ payload: 'x'.repeat(200) })), {
        maxBytes: 64,
      }),
    ).resolves.toEqual({ ok: false, error: 'JSON_TOO_LARGE' });

    await expect(
      readBoundedJson(jsonRequest('{"a":{"b":{"c":1}}}'), { maxDepth: 2 }),
    ).resolves.toEqual({ ok: false, error: 'JSON_TOO_DEEP' });

    await expect(
      readBoundedJson(jsonRequest('[1,2,3,4]'), { maxNodes: 3 }),
    ).resolves.toEqual({ ok: false, error: 'JSON_TOO_COMPLEX' });
  });

  it('rejects prototype-pollution keys and non-json content types', async () => {
    await expect(
      readBoundedJson(jsonRequest('{"__proto__":{"admin":true}}')),
    ).resolves.toEqual({ ok: false, error: 'UNSAFE_JSON_KEY' });

    const request = new Request('https://site-mapper.example/api/test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    await expect(readBoundedJson(request)).resolves.toEqual({
      ok: false,
      error: 'INVALID_CONTENT_TYPE',
    });
  });
});
