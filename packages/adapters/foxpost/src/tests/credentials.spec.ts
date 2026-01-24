import { describe, it, expect, beforeEach } from 'vitest';
import { FoxpostAdapter } from '../index.js';
import type { AdapterContext, CreateParcelsRequest, TrackingRequest, Parcel } from '@shopickup/core';
import { CarrierError } from '@shopickup/core';

class MockHttpClient {
  async post<T>(): Promise<T> {
    return { status: 200, headers: {}, body: { valid: true, parcels: [{ clFoxId: 'CLFOX0000000002' }] } } as unknown as T;
  }

  async get<T>(): Promise<T> {
    return { status: 200, headers: {}, body: { clFox: 'CLFOX0000000002', traces: [] } } as unknown as T;
  }
}

// Helper: create a minimal valid parcel
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

describe('FoxpostAdapter - Credential Validation', () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClient;
  let ctx: AdapterContext;

  beforeEach(() => {
    adapter = new FoxpostAdapter('https://webapi-test.foxpost.hu');
    mockHttp = new MockHttpClient();
    ctx = { http: mockHttp as any, logger: console } as AdapterContext;
  });

  describe('createParcels - credential validation', () => {
    it('rejects missing apiKey', async () => {
      const req: CreateParcelsRequest = {
        parcels: [createTestParcel('p1')],
        credentials: { apiKey: '', basicUsername: 'user', basicPassword: 'pass' } as any,
        options: { useTestApi: true },
      };

      await expect(adapter.createParcels(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects missing basicUsername', async () => {
      const req: CreateParcelsRequest = {
        parcels: [createTestParcel('p1')],
        credentials: { apiKey: 'key', basicUsername: '', basicPassword: 'pass' } as any,
        options: { useTestApi: true },
      };

      await expect(adapter.createParcels(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects missing basicPassword', async () => {
      const req: CreateParcelsRequest = {
        parcels: [createTestParcel('p1')],
        credentials: { apiKey: 'key', basicUsername: 'user', basicPassword: '' } as any,
        options: { useTestApi: true },
      };

      await expect(adapter.createParcels(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects null credentials', async () => {
      const req: CreateParcelsRequest = {
        parcels: [createTestParcel('p1')],
        credentials: null as any,
        options: { useTestApi: true },
      };

      await expect(adapter.createParcels(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects undefined credentials', async () => {
      const req: CreateParcelsRequest = {
        parcels: [createTestParcel('p1')],
        credentials: undefined as any,
        options: { useTestApi: true },
      };

      await expect(adapter.createParcels(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects object missing required credential fields', async () => {
      const req: CreateParcelsRequest = {
        parcels: [createTestParcel('p1')],
        credentials: { apiKey: 'key' } as any,
        options: { useTestApi: true },
      };

      await expect(adapter.createParcels(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('accepts valid credentials', async () => {
      const req: CreateParcelsRequest = {
        parcels: [createTestParcel('p1')],
        credentials: { apiKey: 'valid-key', basicUsername: 'user', basicPassword: 'pass' },
        options: { useTestApi: true },
      };

      const res = await adapter.createParcels(req, ctx);
      expect(res.results).toHaveLength(1);
      expect(res.results[0].carrierId).toBe('CLFOX0000000002');
    });
  });

  describe('track - credential validation', () => {
    it('rejects missing apiKey', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000002',
        credentials: { apiKey: '', basicUsername: 'user', basicPassword: 'pass' } as any,
      };

      await expect(adapter.track(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects missing basicUsername', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000002',
        credentials: { apiKey: 'key', basicUsername: '', basicPassword: 'pass' } as any,
      };

      await expect(adapter.track(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects missing basicPassword', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000002',
        credentials: { apiKey: 'key', basicUsername: 'user', basicPassword: '' } as any,
      };

      await expect(adapter.track(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects null credentials', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000002',
        credentials: null as any,
      };

      await expect(adapter.track(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects undefined credentials', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000002',
        credentials: undefined as any,
      };

      await expect(adapter.track(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('rejects object missing required credential fields', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000002',
        credentials: { apiKey: 'key' } as any,
      };

      await expect(adapter.track(req, ctx)).rejects.toMatchObject({
        category: 'Validation',
      });
    });

    it('accepts valid credentials', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000002',
        credentials: { apiKey: 'valid-key', basicUsername: 'user', basicPassword: 'pass' },
      };

      const res = await adapter.track(req, ctx);
      expect(res.trackingNumber).toBe('CLFOX0000000002');
      expect(Array.isArray(res.events)).toBe(true);
    });
  });
});
