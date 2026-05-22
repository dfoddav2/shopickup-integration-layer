import { describe, it, expect } from 'vitest';
import { FoxpostAdapter } from '../../index.js';
import { CarrierError } from '@shopickup/core';
import type { AdapterContext, Parcel, TrackingRequest } from '@shopickup/core';
import { translateFoxpostError } from '../../errors.js';

class MockLabelErrorHttpClient {
  async post<T>(url: string, _data?: any, _options?: any): Promise<T> {
    if (url.includes('/api/label/')) {
      const error = new Error('Request failed');
      (error as any).response = {
        status: 401,
        data: {
          timestamp: '2026-05-22T10:48:46Z',
          error: 'WRONG_USERNAME_OR_PASSWORD',
          status: 401,
        },
      };
      throw error;
    }

    throw new Error(`Unexpected POST: ${url}`);
  }

  async get<T>(_url: string): Promise<T> { throw new Error('GET not implemented in label error mock'); }
  async put<T>(_url: string): Promise<T> { throw new Error('PUT not implemented in label error mock'); }
  async patch<T>(_url: string): Promise<T> { throw new Error('PATCH not implemented in label error mock'); }
  async delete<T>(_url: string): Promise<T> { throw new Error('DELETE not implemented in label error mock'); }
}

class MockTrackingErrorHttpClient {
  async get<T>(url: string): Promise<T> {
    if (url.includes('/api/tracking/')) {
      return {
        status: 200,
        headers: {},
        body: { clFox: 'CLFOX0000000001', traces: [] },
      } as unknown as T;
    }

    throw new Error(`Unexpected GET: ${url}`);
  }

  async post<T>(_url: string): Promise<T> {
    throw new Error('POST not implemented in tracking error mock');
  }

  async put<T>(_url: string): Promise<T> {
    throw new Error('PUT not implemented in tracking error mock');
  }

  async patch<T>(_url: string): Promise<T> {
    throw new Error('PATCH not implemented in tracking error mock');
  }

  async delete<T>(_url: string): Promise<T> {
    throw new Error('DELETE not implemented in tracking error mock');
  }
}

function createTestParcel(id = 'p1'): Parcel {
  return {
    id,
    shipper: {
      contact: { name: 'Sender', phone: '+36301111111', email: 'sender@example.com' },
      address: {
        name: 'Sender',
        street: '1 Main St',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        phone: '+36301111111',
        email: 'sender@example.com',
      },
    },
    recipient: {
      contact: { name: 'Recipient', phone: '+36302222222', email: 'recipient@example.com' },
      delivery: {
        method: 'HOME',
        address: {
          name: 'Recipient',
          street: '2 Main St',
          city: 'Budapest',
          postalCode: '1012',
          country: 'HU',
          phone: '+36302222222',
          email: 'recipient@example.com',
        },
      },
    },
    package: { weightGrams: 1000 },
    service: 'standard',
    references: { customerReference: 'REF-001' },
  };
}

describe('FoxpostAdapter error handling', () => {
  it('returns failed label results for API 401 responses', async () => {
    const adapter = new FoxpostAdapter('https://webapi-test.foxpost.hu');
    const ctx: AdapterContext = { http: new MockLabelErrorHttpClient() as any, logger: console };

    const result = await adapter.createLabels!(
      {
        parcelCarrierIds: ['CLFOX0000000001'],
        credentials: { apiKey: 'bad-key', basicUsername: 'bad', basicPassword: 'bad' },
      },
      ctx,
    );

    expect(result.allFailed).toBe(true);
    expect(result.failureCount).toBe(1);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].errors?.[0]).toMatchObject({
      code: 'LABEL_GENERATION_FAILED',
      message: 'WRONG_USERNAME_OR_PASSWORD',
    });
  });

  it('returns NotFound when tracking body is empty', async () => {
    const adapter = new FoxpostAdapter('https://webapi-test.foxpost.hu');
    const ctx: AdapterContext = {
      http: {
        async get<T>(_url: string): Promise<T> {
          return { status: 200, headers: {}, body: '' } as unknown as T;
        },
        async post<T>(_url: string): Promise<T> { throw new Error('POST not implemented'); },
        async put<T>(_url: string): Promise<T> { throw new Error('PUT not implemented'); },
        async patch<T>(_url: string): Promise<T> { throw new Error('PATCH not implemented'); },
        async delete<T>(_url: string): Promise<T> { throw new Error('DELETE not implemented'); },
      } as any,
      logger: console,
    };

    const req: TrackingRequest = {
      trackingNumber: 'CLFOX0000000001',
      credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
    };

    await expect(adapter.track(req, ctx)).rejects.toMatchObject({
      category: 'NotFound',
    });
  });

  it('keeps createParcel validation failures as Validation CarrierError', async () => {
    const adapter = new FoxpostAdapter('https://webapi-test.foxpost.hu');
    const ctx: AdapterContext = { http: new MockTrackingErrorHttpClient() as any, logger: console };

    await expect(
      adapter.createParcel!(
        {
          parcel: createTestParcel(),
          credentials: { apiKey: '', basicUsername: 'user', basicPassword: 'pass' },
        },
        ctx,
      )
    ).rejects.toMatchObject({
      category: 'Validation',
    });
  });

  it('exposes carrier error translation helper coverage for 401', () => {
    const error = new Error('Request failed');
    (error as any).response = {
      status: 401,
      data: {
        timestamp: '2026-05-22T10:48:46Z',
        error: 'WRONG_USERNAME_OR_PASSWORD',
        status: 401,
      },
    };

    const translated = translateFoxpostError(error);
    expect(translated).toBeInstanceOf(CarrierError);
    expect(translated.category).toBe('Auth');
    expect(translated.message).toBe('Foxpost credentials invalid');
  });
});
