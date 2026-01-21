import { describe, it, expect, beforeEach } from 'vitest';
import { FoxpostAdapter } from '../index.js';
import type { AdapterContext, CreateParcelsRequest, Parcel } from '@shopickup/core';
import { CarrierError } from '@shopickup/core';

class MockHttpClient {
  lastUrl?: string;
  async post<T>(url: string, data?: any): Promise<T> {
    this.lastUrl = url;

    // If payload contains two parcels, simulate mixed response
    if (Array.isArray(data) && data.length === 2) {
      return {
        parcels: [
          { barcode: 'CLFOXOK1', refCode: data[0].refCode, errors: [] },
          { errors: [{ field: 'recipientPhone', message: 'MISSING' }] },
        ],
      } as unknown as T;
    }

    // Default single item
    return {
      parcels: [{ barcode: 'CLFOX0000000002', errors: [] }],
    } as unknown as T;
  }
}

// Helper: create a minimal valid parcel
function createTestParcel(id: string = 'p1'): Parcel {
  return {
    id,
    sender: {
      name: 'Sender',
      street: '1 Main St',
      city: 'Budapest',
      postalCode: '1011',
      country: 'HU',
      phone: '+36301234567',
      email: 'sender@example.com',
    },
    recipient: {
      name: 'Recipient',
      street: '2 Main St',
      city: 'Budapest',
      postalCode: '1012',
      country: 'HU',
      phone: '+36307654321',
      email: 'recipient@example.com',
    },
    weight: 1000,
    service: 'standard',
    reference: 'REF-001',
  };
}

describe('FoxpostAdapter createParcels', () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClient;
  let ctx: AdapterContext;

  beforeEach(() => {
    adapter = new FoxpostAdapter('https://webapi-test.foxpost.hu');
    mockHttp = new MockHttpClient();
    ctx = { http: mockHttp as any, logger: console } as AdapterContext;
  });

  it('creates multiple parcels and returns per-item results', async () => {
    const req: CreateParcelsRequest = {
      parcels: [
        createTestParcel('p1'),
        createTestParcel('p2'),
      ],
      credentials: { apiKey: 'test-key', username: 'user', password: 'pass' },
      options: { useTestApi: true },
    };

    const res = await adapter.createParcels(req, ctx);
    expect(res).toHaveLength(2);
    expect(res[0].carrierId).toBe('CLFOXOK1');
    expect(res[1].status).toBe('failed');
  });

  it('handles empty parcel array', async () => {
    const req: CreateParcelsRequest = {
      parcels: [],
      credentials: { apiKey: 'test-key', username: 'user', password: 'pass' },
    };

    const res = await adapter.createParcels(req, ctx);
    expect(res).toHaveLength(0);
  });

  it('extracts and uses shared credentials for batch', async () => {
    const req: CreateParcelsRequest = {
      parcels: [
        createTestParcel('p1'),
      ],
      credentials: { apiKey: 'batch-api-key', username: 'batch-user', password: 'batch-pass' },
    };

    const res = await adapter.createParcels(req, ctx);
    expect(res).toHaveLength(1);
    expect(res[0].carrierId).toBe('CLFOX0000000002');
  });
});
