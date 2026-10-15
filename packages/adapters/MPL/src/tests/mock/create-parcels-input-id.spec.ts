/**
 * MPL createParcels - results carry inputId from the echoed webshopId and are
 * returned in input order (SHO-337).
 */

import { describe, it, expect } from 'vitest';
import { MPLAdapter } from '../../index.js';
import type { AdapterContext, Parcel } from '@shopickup/core';

function parcel(id: string): Parcel {
  return {
    id,
    shipper: {
      contact: { name: 'Test Company', phone: '+36301111111', email: 's@test.com' },
      address: { name: 'Test Company', street: '123 Business Avenue', city: 'Budapest', postalCode: '1011', country: 'HU' },
    },
    recipient: {
      contact: { name: 'John Doe', phone: '+36302222222', email: 'j@test.com' },
      delivery: {
        method: 'HOME',
        address: { name: 'John Doe', street: '456 Customer Street', city: 'Debrecen', postalCode: '4024', country: 'HU' },
      },
    },
    package: { weightGrams: 2000, dimensionsCm: { length: 30, width: 20, height: 15 } },
    service: 'standard',
    references: { customerReference: `ORDER-${id}` },
  } as Parcel;
}

function run(ids: string[], body: unknown[]) {
  const ctx = {
    http: { post: async () => ({ status: 200, headers: {}, body }) },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  } as unknown as AdapterContext;
  return new MPLAdapter().createParcels!(
    {
      parcels: ids.map(parcel),
      credentials: { authType: 'apiKey', apiKey: 'k', apiSecret: 's' },
      options: {
        useTestApi: true,
        mpl: { accountingCode: 'ACC-00001', agreementCode: 'AGR-001', bankAccountNumber: '12345678-12345678' },
      },
    } as any,
    ctx,
  );
}

describe('MPL createParcels inputId (SHO-337)', () => {
  it('sets inputId from webshopId on successes and failures', async () => {
    const res = await run(['A', 'B'], [
      { webshopId: 'A', trackingNumber: 'TRK-A' },
      { webshopId: 'B', errors: [{ code: 'E1', text: 'Bad', parameter: 'zip' }] },
    ]);
    expect(res.results.map((r) => [r.inputId, r.status])).toEqual([
      ['A', 'created'],
      ['B', 'failed'],
    ]);
  });

  it('returns results in input order when MPL answers in a different order', async () => {
    const res = await run(['A', 'B', 'C'], [
      { webshopId: 'C', trackingNumber: 'TRK-C' },
      { webshopId: 'A', errors: [{ code: 'E1', text: 'Bad', parameter: 'zip' }] },
      { webshopId: 'B', trackingNumber: 'TRK-B' },
    ]);
    expect(res.results.map((r) => [r.inputId, r.status, r.carrierId])).toEqual([
      ['A', 'failed', undefined],
      ['B', 'created', 'TRK-B'],
      ['C', 'created', 'TRK-C'],
    ]);
  });

  it('keeps MPL order and leaves inputId unset when webshopId is missing or unknown', async () => {
    const res = await run(['A', 'B'], [
      { trackingNumber: 'TRK-1' },
      { webshopId: 'NOT-OURS', trackingNumber: 'TRK-2' },
    ]);
    expect(res.results.map((r) => [r.inputId, r.carrierId])).toEqual([
      [undefined, 'TRK-1'],
      [undefined, 'TRK-2'],
    ]);
  });
});
