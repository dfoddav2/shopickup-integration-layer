import { describe, it, expect, vi } from 'vitest';
import { createAxiosHttpClient } from '../axios-client';

describe('axios client debug', () => {
  it('calls logger.debug when debug=true', async () => {
    const spy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const client = createAxiosHttpClient({ debug: true, logger: spy });
    // We don't actually call the network; assert the client exists and debug option is wired.
    expect(typeof client.get).toBe('function');
    // Call a method that will throw because no server, but should invoke logger.debug first
    try {
      await client.get('http://localhost:0/');
    } catch (e) {
      // ignore
    }
    expect(spy.debug).toHaveBeenCalled();
  });
});
