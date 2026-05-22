import { describe, expect, it } from 'vitest';
import { FoxpostAdapter } from '../../index.js';

const liveEnabled = process.env.FOXPOST_LIVE_PUBLIC_FEED === 'true';

const liveFeed = {
  enabled: liveEnabled,
  adapter: new FoxpostAdapter(),
  context: {
    http: {
      async get<T>(url: string): Promise<T> {
        const response = await fetch(url);
        const body = await response.json();
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        } as T;
      },
      async post<T>(): Promise<T> { throw new Error('POST not implemented'); },
      async put<T>(): Promise<T> { throw new Error('PUT not implemented'); },
      async patch<T>(): Promise<T> { throw new Error('PATCH not implemented'); },
      async delete<T>(): Promise<T> { throw new Error('DELETE not implemented'); },
    },
    logger: console,
  },
};

const describeLive = liveFeed.enabled ? describe : describe.skip;

describeLive('Foxpost live pickup points', () => {
  it('loads the public pickup point feed', async () => {
    const result = await liveFeed.adapter.fetchPickupPoints({}, liveFeed.context as any);

    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points[0]).toBeDefined();
  });
});
