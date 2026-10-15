/**
 * GLS createParcels - results are matched to input parcels by client reference
 * (SHO-337). GLS returns all successes before all errors, not in input order.
 */

import { describe, it, expect, vi } from 'vitest';
import type { AdapterContext } from '@shopickup/core';
import { GLSAdapter } from '../../index.js';

const credentials = { username: 'u@example.com', password: 'pw', clientNumberList: [123456789] };

function parcel(id: string) {
  return {
    id,
    shipper: {
      contact: { name: 'Seller', phone: '+36301234567', email: 's@example.com' },
      address: { name: 'Seller', street: 'Seller Street 1', city: 'Budapest', postalCode: '1012', country: 'HU' },
    },
    recipient: {
      contact: { name: 'Buyer', phone: '+36201234567', email: 'b@example.com' },
      delivery: {
        method: 'HOME',
        address: { name: 'Buyer', street: 'Buyer Street 5', city: 'Siofok', postalCode: '8600', country: 'HU' },
      },
    },
    package: { weightGrams: 1000 },
    service: 'standard',
  };
}

function ctxReturning(body: unknown): AdapterContext {
  return {
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    http: { post: async () => ({ status: 200, headers: {}, body }) },
  } as unknown as AdapterContext;
}

const create = (parcels: string[], body: unknown) =>
  new GLSAdapter().createParcels(
    { parcels: parcels.map(parcel) as any, credentials, options: { useTestApi: true } },
    ctxReturning(body),
  );

describe('GLS createParcels inputId (SHO-337)', () => {
  it('links a mixed batch where the first parcel fails (successes listed before errors)', async () => {
    const res = await create(['A', 'B'], {
      ParcelInfoList: [{ ClientReference: 'B', ParcelId: 222 }],
      PrepareLabelsError: [{ ErrorCode: 5, ErrorDescription: 'Bad zip', ClientReferenceList: ['A'] }],
    });

    expect(res.results.map((r) => r.inputId)).toEqual(['A', 'B']);
    expect(res.results[0].status).toBe('failed');
    expect(res.results[0].carrierId).toBeUndefined();
    expect(res.results[0].errors?.[0].code).toBe('5');
    expect(res.results[1].status).toBe('created');
    expect(res.results[1].carrierId).toBe('222');
    expect(res.someFailed).toBe(true);
  });

  it('returns results in input order even when GLS lists successes in a different order', async () => {
    const res = await create(['A', 'B', 'C'], {
      ParcelInfoList: [
        { ClientReference: 'C', ParcelId: 3 },
        { ClientReference: 'A', ParcelId: 1 },
        { ClientReference: 'B', ParcelId: 2 },
      ],
      PrepareLabelsError: [],
    });
    expect(res.results.map((r) => [r.inputId, r.carrierId])).toEqual([
      ['A', '1'],
      ['B', '2'],
      ['C', '3'],
    ]);
  });

  it('applies one error that lists several client references to each of them', async () => {
    const res = await create(['A', 'B', 'C'], {
      ParcelInfoList: [{ ClientReference: 'C', ParcelId: 3 }],
      PrepareLabelsError: [{ ErrorCode: 7, ErrorDescription: 'Bad', ClientReferenceList: ['A', 'B'] }],
    });
    expect(res.results.map((r) => [r.inputId, r.status])).toEqual([
      ['A', 'failed'],
      ['B', 'failed'],
      ['C', 'created'],
    ]);
  });

  it('marks a parcel missing from both lists as failed instead of guessing', async () => {
    const res = await create(['A', 'B'], {
      ParcelInfoList: [{ ClientReference: 'A', ParcelId: 1 }],
      PrepareLabelsError: [],
    });
    expect(res.results[0]).toMatchObject({ inputId: 'A', status: 'created' });
    expect(res.results[1]).toMatchObject({ inputId: 'B', status: 'failed' });
    expect(res.results[1].errors?.[0].code).toBe('NO_RESULT');
  });

  it('attaches batch-level errors (no client reference) to parcels GLS did not confirm', async () => {
    const res = await create(['A', 'B'], {
      ParcelInfoList: [],
      PrepareLabelsError: [{ ErrorCode: 14, ErrorDescription: 'Auth problem', ClientReferenceList: [] }],
    });
    expect(res.results.map((r) => [r.inputId, r.status])).toEqual([
      ['A', 'failed'],
      ['B', 'failed'],
    ]);
    expect(res.results[0].errors?.[0].code).toBe('14');
  });

  it('keeps successes without a matching reference after the ordered results, without an inputId', async () => {
    const res = await create(['A'], {
      ParcelInfoList: [
        { ClientReference: 'A', ParcelId: 1 },
        { ClientReference: 'UNKNOWN', ParcelId: 9 },
      ],
      PrepareLabelsError: [],
    });
    expect(res.results).toHaveLength(2);
    expect(res.results[0]).toMatchObject({ inputId: 'A', carrierId: '1' });
    expect(res.results[1].inputId).toBeUndefined();
    expect(res.results[1].carrierId).toBe('9');
  });

  it('rejects duplicate parcel ids before calling GLS', async () => {
    const post = vi.fn();
    const ctx = { logger: console, http: { post } } as unknown as AdapterContext;
    await expect(
      new GLSAdapter().createParcels(
        { parcels: [parcel('A'), parcel('A')] as any, credentials, options: { useTestApi: true } },
        ctx,
      ),
    ).rejects.toThrow(/Duplicate parcel id/);
    expect(post).not.toHaveBeenCalled();
  });
});
