import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { createAxiosHttpClient } from '../axios-client';

describe('axios client error normalization', () => {
  beforeAll(() => nock.disableNetConnect());
  afterAll(() => nock.enableNetConnect());

  it('captures 500 response with normalized error', async () => {
    nock('https://api.test').post('/foo').reply(500, { message: 'boom' });
    const client = createAxiosHttpClient({ defaultTimeoutMs: 1000 });
    await expect(client.post('https://api.test/foo', { a: 1 })).rejects.toMatchObject({
      status: 500,
      response: { data: { message: 'boom' } }
    });
  });
});
