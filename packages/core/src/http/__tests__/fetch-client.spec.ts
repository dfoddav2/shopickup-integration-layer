import { describe, it, expect, vi } from 'vitest';
import { createFetchHttpClient } from '../fetch-client';

describe('createFetchHttpClient', () => {
  it('returns an object with http methods', async () => {
    const client = createFetchHttpClient({ fetchFn: globalThis.fetch as any });
    expect(typeof client.get).toBe('function');
    expect(typeof client.post).toBe('function');
    expect(typeof client.put).toBe('function');
    expect(typeof client.patch).toBe('function');
    expect(typeof client.delete).toBe('function');
  });

  it('reads binary responses with arrayBuffer only once', async () => {
    const text = vi.fn(async () => {
      throw new Error('text() should not be called for binary responses');
    });
    const arrayBuffer = vi.fn(async () => new Uint8Array([37, 80, 68, 70]).buffer);

    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/pdf' : null),
        [Symbol.iterator]: function* () {
          yield ['content-type', 'application/pdf'];
        },
      },
      text,
      arrayBuffer,
    })) as any;

    const client = createFetchHttpClient({ fetchFn });
    const response = await client.get('https://example.test/label', { responseType: 'arraybuffer' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(text).not.toHaveBeenCalled();
    expect(response.body).toBeInstanceOf(Uint8Array);
    expect((response.body as Uint8Array).byteLength).toBe(4);
  });
});
