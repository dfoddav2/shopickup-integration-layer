import { describe, it, expect, vi } from 'vitest';
import { createFetchHttpClient } from '../fetch-client';

describe('fetch client debug', () => {
  it('calls logger.debug when debug=true', async () => {
    const spy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const client = createFetchHttpClient({ debug: true, logger: spy, fetchFn: globalThis.fetch as any });
    try {
      await client.get('http://localhost:0/');
    } catch (e) {
      // ignore
    }
    expect(spy.debug).toHaveBeenCalled();
  });

  it('uses debugMaxBodyLength for request previews', async () => {
    const spy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        [Symbol.iterator]: function* () {
          yield ['content-type', 'application/json'];
        },
      },
      text: async () => JSON.stringify({ ok: true }),
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as any;

    const client = createFetchHttpClient({
      debug: true,
      debugFullBody: true,
      debugMaxBodyLength: 8,
      logger: spy,
      fetchFn,
    });

    await client.post('http://example.test/', 'abcdefghijklmnopqrstuvwxyz');

    const requestCall = (spy.debug as any).mock.calls.find((c: any[]) => c[0] === 'request');
    expect(requestCall).toBeDefined();
    expect(requestCall[1].bodyPreview).toHaveLength(8);
    expect(requestCall[1].bodyPreview.startsWith('"')).toBe(true);
  });
});
