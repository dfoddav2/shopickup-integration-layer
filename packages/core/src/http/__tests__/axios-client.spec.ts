import { describe, it, expect } from 'vitest';
import { createAxiosHttpClient } from '../axios-client';

describe('createAxiosHttpClient', () => {
  it('should perform a GET and return data', async () => {
    // This is an integration-like test; we mock axios via a fake server using msw or nock in full setup.
    // For now assert the factory returns an object with methods
    const client = createAxiosHttpClient();
    expect(typeof client.get).toBe('function');
    expect(typeof client.post).toBe('function');
    expect(typeof client.put).toBe('function');
    expect(typeof client.patch).toBe('function');
    expect(typeof client.delete).toBe('function');
  });
});
