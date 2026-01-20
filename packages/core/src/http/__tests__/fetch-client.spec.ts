import { describe, it, expect } from 'vitest';
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
});
