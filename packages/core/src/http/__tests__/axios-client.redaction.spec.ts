import { describe, it, expect, vi } from 'vitest';
import { createAxiosHttpClient } from '../axios-client';

describe('axios client redaction', () => {
  it('redacts sensitive headers in request debug log', async () => {
    const spy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const client = createAxiosHttpClient({ debug: true, logger: spy });

    try {
      await client.get('http://localhost:0/', {
        headers: {
          Authorization: 'secret',
          'X-API-Key': 'abc',
          'Api-Key': 'xyz',
          password: 'p',
          token: 't',
          Other: 'ok',
        },
      });
    } catch (e) {
      // network error expected; ignore
    }

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
