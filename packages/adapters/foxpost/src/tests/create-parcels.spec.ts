import { describe, it, expect, beforeEach } from 'vitest';
import { FoxpostAdapter } from '../index.js';
import type { AdapterContext, CreateParcelsRequest, CreateParcelRequest, Parcel } from '@shopickup/core';
import { CarrierError } from '@shopickup/core';

class MockHttpClient {
  lastUrl?: string;
  async post<T>(url: string, data?: any): Promise<T> {
    this.lastUrl = url;

    // If payload contains two parcels, simulate mixed response
    if (Array.isArray(data) && data.length === 2) {
      return {
        valid: true,
        parcels: [
          { clFoxId: 'CLFOXOK1', refCode: data[0].refCode, errors: null },
          { errors: [{ field: 'recipientPhone', message: 'MISSING' }] },
        ],
      } as unknown as T;
    }

    // Default single item
    return {
      valid: true,
      parcels: [{ clFoxId: 'CLFOX0000000002', errors: null }],
    } as unknown as T;
  }
}

// Helper: create a minimal valid parcel with new Parcel structure
function createTestParcel(id: string = 'p1'): Parcel {
  return {
    id,
    shipper: {
      contact: {
        name: 'Sender Company',
        phone: '+36301234567',
        email: 'sender@example.com',
      },
      address: {
        name: 'Sender',
        street: '1 Main St',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        phone: '+36301234567',
        email: 'sender@example.com',
      },
    },
    recipient: {
      contact: {
        name: 'Recipient',
        phone: '+36307654321',
        email: 'recipient@example.com',
      },
      delivery: {
        method: 'HOME' as const,
        address: {
          name: 'Recipient',
          street: '2 Main St',
          city: 'Budapest',
          postalCode: '1012',
          country: 'HU',
          phone: '+36307654321',
          email: 'recipient@example.com',
        },
      },
    },
    package: {
      weightGrams: 1000,
    },
    service: 'standard' as const,
    references: {
      customerReference: 'REF-001',
    },
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
      credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
      options: { useTestApi: true },
    };

     const res = await adapter.createParcels(req, ctx);
     expect(res.results).toHaveLength(2);
     expect(res.results[0].carrierId).toBe('CLFOXOK1');
     expect(res.results[1].status).toBe('failed');
   });

  it('rejects empty parcel array', async () => {
    const req: CreateParcelsRequest = {
      parcels: [],
      credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
    };

    await expect(adapter.createParcels(req, ctx)).rejects.toThrow(
      'Invalid request'
    );
  });

   it('extracts and uses shared credentials for batch', async () => {
     const req: CreateParcelsRequest = {
       parcels: [
         createTestParcel('p1'),
       ],
       credentials: { apiKey: 'batch-api-key', basicUsername: 'batch-user', basicPassword: 'batch-pass' },
     };

     const res = await adapter.createParcels(req, ctx);
     expect(res.results).toHaveLength(1);
     expect(res.results[0].carrierId).toBe('CLFOX0000000002');
   });

  it('returns validation errors array for failed parcels', async () => {
    const mockHttp: any = {
      async post<T>(url: string, data?: any): Promise<T> {
        return {
          valid: true,
          parcels: [
            {
              clFoxId: 'CLFOX0000000001',
              refCode: 'p1',
              errors: null,
            },
            {
              clFoxId: null,
              refCode: 'p2',
              errors: [
                { field: 'recipientPhone', message: 'MISSING' },
                { field: 'recipientZip', message: 'INVALID_FORMAT' },
              ],
            },
          ],
        } as unknown as T;
      },
    };

    const contextWithMock: AdapterContext = { http: mockHttp, logger: console };
    const req: CreateParcelsRequest = {
      parcels: [createTestParcel('p1'), createTestParcel('p2')],
      credentials: { apiKey: 'test', basicUsername: 'user', basicPassword: 'pass' },
    };

     const res = await adapter.createParcels(req, contextWithMock);
     expect(res.results).toHaveLength(2);
     
     // First parcel succeeded
     expect(res.results[0].status).toBe('created');
     expect(res.results[0].carrierId).toBe('CLFOX0000000001');
     expect(res.results[0].errors).toBeUndefined();
     
     // Second parcel failed with multiple errors
     expect(res.results[1].status).toBe('failed');
     expect(res.results[1].carrierId).toBeNull();
     expect(res.results[1].errors).toBeDefined();
     expect(res.results[1].errors).toHaveLength(2);
     
     // Check error details
     const errors = res.results[1].errors!;
     expect(errors[0].field).toBe('recipientPhone');
     expect(errors[0].code).toBe('MISSING');
     expect(errors[0].message).toContain('recipientPhone');
     
      expect(errors[1].field).toBe('recipientZip');
      expect(errors[1].code).toBe('INVALID_FORMAT');
    });
});

describe('FoxpostAdapter createParcel', () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClient;
  let ctx: AdapterContext;

  beforeEach(() => {
    adapter = new FoxpostAdapter('https://webapi-test.foxpost.hu');
    mockHttp = new MockHttpClient();
    ctx = { http: mockHttp as any, logger: console } as AdapterContext;
  });

  it('returns rawCarrierResponse in result', async () => {
    const parcel = createTestParcel('p1');
    const req = {
      parcel,
      credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
    };
    const res = await adapter.createParcel(req, ctx);

    // Should have the per-item result data
    expect(res.carrierId).toBeDefined();
    expect(res.status).toBe('created');
    expect(res.raw).toBeDefined();

    // Should also have rawCarrierResponse from the batch HTTP call
    const rawCarrierResp = (res as any).rawCarrierResponse;
    expect(rawCarrierResp).toBeDefined();
    expect(rawCarrierResp).toHaveProperty('valid');
    
    // Log the structure for verification
    console.log('rawCarrierResponse structure:', JSON.stringify(rawCarrierResp, null, 2));
  });
});
