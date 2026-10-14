/**
 * GLS Adapter - International endpoint routing (mock HTTP)
 *
 * Asserts which MyGLS host each operation posts to. The mock records the URL
 * and then fails, so we only inspect the request, not a realistic response.
 */

import { describe, it, expect, vi } from 'vitest';
import type { AdapterContext } from '@shopickup/core';
import { GLSAdapter } from '../../index.js';

function recordingContext() {
  const urls: string[] = [];
  const fail = async (url: string) => {
    urls.push(url);
    throw new Error('stop-after-record');
  };
  const ctx = {
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    http: { get: fail, post: fail, put: fail, patch: fail, delete: fail },
  } as unknown as AdapterContext;
  return { ctx, urls };
}

const credentials = { username: 'u@example.com', password: 'pw', clientNumberList: [123456789] };

function parcel(shipperCountry: string, recipientCountry: string) {
  const dial: Record<string, string> = { HU: '+36', CZ: '+420', RS: '+381' };
  return {
    id: 'ORDER-1',
    shipper: {
      contact: { name: 'Seller', phone: `${dial[shipperCountry]} 1 111 1111`, email: 's@example.com' },
      address: { name: 'Seller', street: 'Seller Street 1', city: 'City', postalCode: '1012', country: shipperCountry },
    },
    recipient: {
      contact: { name: 'Buyer', phone: `${dial[recipientCountry]} 222 2222`, email: 'b@example.com' },
      delivery: {
        method: 'HOME',
        address: { name: 'Buyer', street: 'Buyer Street 5', city: 'Town', postalCode: '1000', country: recipientCountry },
      },
    },
    package: { weightGrams: 1000 },
    service: 'standard',
  };
}

async function hostsFor(run: (adapter: GLSAdapter, ctx: AdapterContext) => Promise<unknown>) {
  const { ctx, urls } = recordingContext();
  await run(new GLSAdapter(), ctx).catch(() => undefined);
  return urls.map((u) => new URL(u).host);
}

describe('GLS international endpoint routing', () => {
  it('sends a HU -> CZ parcel through the HU endpoint', async () => {
    const hosts = await hostsFor((a, c) =>
      a.createParcels({ parcels: [parcel('HU', 'CZ')] as any, credentials, options: { useTestApi: true } }, c));
    expect(hosts).toEqual(['api.test.mygls.hu']);
  });

  it('routes by sender country when it is not HU', async () => {
    const hosts = await hostsFor((a, c) =>
      a.createParcels({ parcels: [parcel('CZ', 'HU')] as any, credentials, options: { useTestApi: true } }, c));
    expect(hosts).toEqual(['api.test.mygls.cz']);
  });

  it('lets options.gls.country override the sender country', async () => {
    const hosts = await hostsFor((a, c) =>
      a.createParcels(
        { parcels: [parcel('HU', 'CZ')] as any, credentials, options: { useTestApi: true, gls: { country: 'SK' } } as any },
        c,
      ));
    expect(hosts).toEqual(['api.test.mygls.sk']);
  });

  it('keeps honoring the legacy options.country', async () => {
    const hosts = await hostsFor((a, c) =>
      a.createParcels({ parcels: [parcel('HU', 'CZ')] as any, credentials, options: { useTestApi: true, country: 'RO' } }, c));
    expect(hosts).toEqual(['api.test.mygls.ro']);
  });

  it('rejects a batch with mixed sender countries and no explicit country', async () => {
    const { ctx, urls } = recordingContext();
    await expect(
      new GLSAdapter().createParcels({ parcels: [parcel('HU', 'CZ'), parcel('CZ', 'HU')] as any, credentials }, ctx),
    ).rejects.toThrow(/different sender countries/);
    expect(urls).toEqual([]);
  });

  it('routes createLabel and track by options.gls.country / options.country', async () => {
    const labelHosts = await hostsFor((a, c) =>
      a.createLabel({ parcelCarrierId: '1', credentials, options: { useTestApi: true, gls: { country: 'HR' } } } as any, c));
    expect(labelHosts).toEqual(['api.test.mygls.hr']);

    const trackHosts = await hostsFor((a, c) =>
      a.track({ trackingNumber: '123', credentials, options: { useTestApi: true, gls: { country: 'SI' } } } as any, c));
    expect(trackHosts).toEqual(['api.test.mygls.si']);
  });

  it('routes one-step printLabels by the first parcel sender country', async () => {
    const hosts = await hostsFor((a, c) =>
      a.printLabels({ parcels: [parcel('HU', 'CZ')] as any, credentials, options: { useTestApi: true } } as any, c));
    expect(hosts).toEqual(['api.test.mygls.hu']);
  });
});
