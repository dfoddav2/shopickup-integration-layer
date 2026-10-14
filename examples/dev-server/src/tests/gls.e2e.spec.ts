import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerGLSRoutes } from '../gls/index.js';

/**
 * E2E tests for GLS routes with a recording HTTP client (no network).
 * They check which MyGLS host each request is routed to.
 */
describe('GLS routes - international routing E2E', () => {
  let fastify: any;
  let urls: string[] = [];

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    const fail = async (url: string) => {
      urls.push(url);
      throw new Error('stop-after-record');
    };
    fastify.decorate('httpClient', { get: fail, post: fail, put: fail, patch: fail, delete: fail });
    await registerGLSRoutes(fastify);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    urls = [];
  });

  const credentials = { username: 'api@mygls.hu', password: 'secret', clientNumberList: [12345] };

  const parcel = (recipientCountry: string, phone: string) => ({
    id: 'ORDER-1',
    shipper: {
      contact: { name: 'Seller', phone: '+36 1 111 1111', email: 's@example.com' },
      address: { name: 'Seller', street: 'Seller Street 1', city: 'Budapest', postalCode: '1012', country: 'HU' },
    },
    recipient: {
      contact: { name: 'Buyer', phone, email: 'b@example.com' },
      delivery: {
        method: 'HOME',
        address: { name: 'Buyer', street: 'Buyer Street 5', city: 'Prague', postalCode: '11000', country: recipientCountry },
      },
    },
    package: { weightGrams: 1000 },
    service: 'standard',
  });

  it('sends a HU -> CZ create-parcels request to the HU endpoint', async () => {
    await fastify.inject({
      method: 'POST',
      url: '/api/dev/gls/create-parcels',
      payload: { parcels: [parcel('CZ', '+420 123 456 789')], credentials, options: { useTestApi: true } },
    });
    expect(urls.map((u) => new URL(u).host)).toEqual(['api.test.mygls.hu']);
  });

  it('rejects an unsupported destination before calling GLS', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/dev/gls/create-parcels',
      payload: { parcels: [parcel('DE', '+49 123 456 789')], credentials, options: { useTestApi: true } },
    });
    expect(urls.length).toBe(0);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.body).toMatch(/does not support shipping to DE/);
  });

  it('forwards options.country on track instead of dropping it', async () => {
    await fastify.inject({
      method: 'POST',
      url: '/api/dev/gls/track',
      payload: { trackingNumber: '123456789', credentials, options: { useTestApi: true, country: 'SK' } },
    });
    expect(urls.map((u) => new URL(u).host)).toEqual(['api.test.mygls.sk']);
  });
});
