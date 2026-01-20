import { describe, it, expect, vi } from 'vitest';
import { createFetchHttpClient } from '../fetch-client';

// Minimal fetch mock that returns a 200 OK with JSON body
function makeFetchMock() {
  return async function fetchMock(url: string, init?: any) {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',

      text: async () => JSON.stringify({ success: true }),
      json: async () => ({ success: true }),
      headers: {
        get: (k: string) => (k === 'content-type' ? 'application/json' : undefined),
        // for Object.fromEntries in client
        [Symbol.iterator]: function* () { yield ['content-type', 'application/json']; }
      }
    } as any;
  };
}

describe('fetch client redaction', () => {
  it('redacts sensitive headers in request debug log', async () => {
    const spy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const fetchMock = makeFetchMock();
    const client = createFetchHttpClient({ debug: true, logger: spy, fetchFn: fetchMock as any });

    await client.get('http://example.test/', {
      headers: {
        Authorization: 'secret',
        'X-API-Key': 'abc',
        'Api-Key': 'xyz',
        password: 'p',
        token: 't',
        Other: 'ok',
      },
    });

    const call = (spy.debug as any).mock.calls.find((c: any[]) => c[0] === 'request');
    expect(call).toBeDefined();
    const meta = call[1];
    expect(meta).toBeDefined();
    expect(meta.headers.Authorization).toBe('REDACTED');
    expect(meta.headers['X-API-Key']).toBe('REDACTED');
    expect(meta.headers['Api-Key']).toBe('REDACTED');
    expect(meta.headers.password).toBe('REDACTED');
    expect(meta.headers.token).toBe('REDACTED');
    expect(meta.headers.Other).toBe('ok');
  });
});
