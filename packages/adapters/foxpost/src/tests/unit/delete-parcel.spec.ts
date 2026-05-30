/**
 * Unit tests for delete-parcel capability
 */

import { describe, it, expect, vi } from 'vitest';
import { deleteParcel } from '../../capabilities/delete-parcel.js';
import { CarrierError } from '@shopickup/core';

function createMockHttpClient(response: any) {
  return {
    delete: vi.fn().mockResolvedValue(response),
    post: vi.fn(),
    get: vi.fn(),
  };
}

function createResolveBaseUrl() {
  return (_opts?: { useTestApi?: boolean }) => 'https://webapi.foxpost.hu';
}

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('deleteParcel', () => {
  const baseReq = {
    parcelCarrierId: 'CLFOX0000000001',
    credentials: {
      apiKey: 'test-api-key',
      basicUsername: 'user',
      basicPassword: 'pass',
    },
  };

  it('returns deleted status on HTTP 204', async () => {
    const http = createMockHttpClient({ statusCode: 204 });
    const result = await deleteParcel(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.status).toBe('deleted');
    expect(result.carrierId).toBe('CLFOX0000000001');
  });

  it('returns deleted status on HTTP 200', async () => {
    const http = createMockHttpClient({ statusCode: 200 });
    const result = await deleteParcel(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.status).toBe('deleted');
    expect(result.carrierId).toBe('CLFOX0000000001');
  });

  it('passes isWeb query param from options', async () => {
    const http = createMockHttpClient({ statusCode: 204 });
    const req = {
      ...baseReq,
      options: { foxpost: { isWeb: false } },
    };

    await deleteParcel(req as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    const callUrl = (http.delete as any).mock.calls[0][0];
    expect(callUrl).toContain('isWeb=false');
  });

  it('returns failed status on HTTP 400', async () => {
    const http = createMockHttpClient({ statusCode: 400, body: { error: 'INVALID_BARCODE', status: 400 } });
    const result = await deleteParcel(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.status).toBe('failed');
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('returns failed status on HTTP 401', async () => {
    const http = createMockHttpClient({ statusCode: 401, body: { error: 'WRONG_USERNAME_OR_PASSWORD', status: 401 } });
    const result = await deleteParcel(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.status).toBe('failed');
    expect(result.errors).toBeDefined();
  });

  it('returns failed status for missing parcelCarrierId', async () => {
    const http = createMockHttpClient({ statusCode: 204 });
    const req = { ...baseReq, parcelCarrierId: '' };

    const result = await deleteParcel(req as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.status).toBe('failed');
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0].code).toBe('Validation');
  });

  it('returns failed status when HTTP client is missing', async () => {
    const result = await deleteParcel(baseReq as any, { logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.status).toBe('failed');
    expect(result.errors).toBeDefined();
    expect(result.errors![0].code).toBe('Permanent');
  });
});
