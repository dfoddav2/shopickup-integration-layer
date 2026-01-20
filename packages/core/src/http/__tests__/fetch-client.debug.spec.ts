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
});
