import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import nock from 'nock';
import { createAxiosHttpClient } from '../axios-client';

describe('axios client response redaction and body preview', () => {
  beforeAll(() => nock.disableNetConnect());
  afterAll(() => nock.enableNetConnect());

  it('redacts sensitive response headers and does not expose body when debugFullBody=false', async () => {
    const body = { secret: 's', public: 'ok' };
    nock('https://api.test')
      .get('/bar')
      .reply(200, body, { 'x-api-key': 'resp-secret', Authorization: 'resp-auth', Other: 'ok' });

    const spy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const client = createAxiosHttpClient({ debug: true, debugFullBody: false, logger: spy });
    const res = await client.get('https://api.test/bar');
    expect(res).toMatchObject(body);

    const call = (spy.debug as any).mock.calls.find((c: any[]) => c[0] === 'response');
    expect(call).toBeDefined();
    const meta = call[1];
    expect(meta).toBeDefined();
    // response headers should be sanitized
    expect(meta.headers['x-api-key']).toBe('REDACTED');
    // axios lowercases response header keys, assert on lowercase form
    expect(meta.headers.authorization || meta.headers.Authorization).toBe('REDACTED');
    expect(meta.headers.other || meta.headers.Other).toBe('ok');
    // bodyPreview should be undefined when debugFullBody=false
    expect(meta.bodyPreview).toBeUndefined();

    // ensure no debug call contains the full raw body string
    const raw = JSON.stringify(body);
    for (const c of (spy.debug as any).mock.calls) {
      const arg = JSON.stringify(c[1] || {});
      expect(arg.includes(raw)).toBe(false);
    }
  });

  it('includes truncated bodyPreview when debugFullBody=true and still redacts headers', async () => {
    // make a response with a long field to force truncation
    const long = 'a'.repeat(1000);
    const body = { big: long, ok: true };
    nock('https://api.test')
      .get('/big')
      .reply(200, body, { 'x-api-key': 'resp-secret', authorization: 'resp-auth' });

    const spy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const client = createAxiosHttpClient({ debug: true, debugFullBody: true, logger: spy });
    const res = await client.get('https://api.test/big');
    expect(res).toMatchObject(body);

    const call = (spy.debug as any).mock.calls.find((c: any[]) => c[0] === 'response');
    expect(call).toBeDefined();
    const meta = call[1];
    expect(meta).toBeDefined();
    expect(meta.headers['x-api-key']).toBe('REDACTED');
    expect(meta.headers.authorization).toBe('REDACTED');
    // bodyPreview should be present but truncated to at most 200 chars
    expect(typeof meta.bodyPreview).toBe('string');
    expect(meta.bodyPreview.length).toBeLessThanOrEqual(200);
    // ensure it is a prefix of the JSON body
    expect(JSON.stringify(body).startsWith(meta.bodyPreview)).toBe(true);
  });
});
