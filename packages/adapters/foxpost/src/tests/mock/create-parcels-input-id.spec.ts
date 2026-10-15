/**
 * Foxpost createParcels - inputId is set from the response position, and only
 * when the response has exactly one entry per input parcel (SHO-337).
 */

import { describe, it, expect } from 'vitest';
import { FoxpostAdapter } from '../../index.js';
import type { AdapterContext, Parcel } from '@shopickup/core';

function parcel(id: string): Parcel {
  return {
    id,
    shipper: {
      contact: { name: 'Sender', phone: '+36301234567', email: 's@example.com' },
      address: { name: 'Sender', street: '1 Main St', city: 'Budapest', postalCode: '1011', country: 'HU' },
    },
    recipient: {
      contact: { name: 'Recipient', phone: '+36307654321', email: 'r@example.com' },
      delivery: {
        method: 'HOME',
        address: { name: 'Recipient', street: '2 Main St', city: 'Budapest', postalCode: '1012', country: 'HU' },
      },
    },
    package: { weightGrams: 1000 },
    service: 'standard',
  } as Parcel;
}

const credentials = { apiKey: 'k', basicUsername: 'u', basicPassword: 'p' };

function run(ids: string[], parcels: unknown[]) {
  const ctx = {
    http: { post: async () => ({ status: 200, headers: {}, body: { valid: true, parcels } }) },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  } as unknown as AdapterContext;
  return new FoxpostAdapter('https://webapi-test.foxpost.hu').createParcels(
    { parcels: ids.map(parcel), credentials, options: { useTestApi: true } } as any,
    ctx,
  );
}

describe('Foxpost createParcels inputId (SHO-337)', () => {
  it('sets inputId on successes and failures by position', async () => {
    const res = await run(['p1', 'p2', 'p3'], [
      { errors: [{ field: 'recipientPhone', message: 'MISSING' }] },
      { clFoxId: 'CLFOX2', errors: null },
      { clFoxId: 'CLFOX3', errors: null },
    ]);
    expect(res.results.map((r) => [r.inputId, r.status, r.carrierId])).toEqual([
      ['p1', 'failed', undefined],
      ['p2', 'created', 'CLFOX2'],
      ['p3', 'created', 'CLFOX3'],
    ]);
  });

  it('leaves inputId unset when the response size does not match the request', async () => {
    const res = await run(['p1', 'p2'], [{ clFoxId: 'CLFOX1', errors: null }]);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].inputId).toBeUndefined();
  });
});
