/**
 * Unit tests for create-return capability
 */

import { describe, it, expect, vi } from 'vitest';
import { createReturn, createReturns } from '../../capabilities/return.js';
import { CarrierError } from '@shopickup/core';

function createMockHttpClient(response: any) {
  return {
    post: vi.fn().mockResolvedValue(response),
    get: vi.fn(),
    delete: vi.fn(),
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

describe('createReturns', () => {
  const baseReq = {
    returns: [
      { parcelCarrierId: 'CLFOX0000000001' },
      { parcelCarrierId: 'CLFOX0000000002', uniqueBarcode: 'UB123', refCode: 'REF-001' },
    ],
    credentials: {
      apiKey: 'test-api-key',
      basicUsername: 'user',
      basicPassword: 'pass',
    },
  };

  it('creates returns successfully', async () => {
    const http = createMockHttpClient({
      body: [
        { barcode: 'CLFOX0000000001', newBarcode: 'CLFOX0000000001-RET', created: true },
        { barcode: 'CLFOX0000000002', newBarcode: 'CLFOX0000000002-RET', created: true },
      ],
    });

    const result = await createReturns(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.allSucceeded).toBe(true);
    expect(result.results[0].carrierId).toBe('CLFOX0000000001-RET');
    expect(result.results[1].carrierId).toBe('CLFOX0000000002-RET');
  });

  it('handles partial failures', async () => {
    const http = createMockHttpClient({
      body: [
        { barcode: 'CLFOX0000000001', newBarcode: 'CLFOX0000000001-RET', created: true },
        { barcode: 'CLFOX0000000002', errors: [{ field: 'barcode', message: 'INVALID_BARCODE' }] },
      ],
    });

    const result = await createReturns(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.someFailed).toBe(true);
    expect(result.results[1].status).toBe('failed');
  });

  it('handles all failures', async () => {
    const http = createMockHttpClient({
      body: [
        { barcode: 'CLFOX0000000001', errors: [{ message: 'INVALID' }] },
        { barcode: 'CLFOX0000000002', errors: [{ message: 'INVALID' }] },
      ],
    });

    const result = await createReturns(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(2);
    expect(result.allFailed).toBe(true);
  });

  it('uses returnType from options', async () => {
    const http = createMockHttpClient({ body: [] });
    const req = {
      ...baseReq,
      options: { foxpost: { returnType: 'IRE' as const } },
    };

    await createReturns(req as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    const callUrl = (http.post as any).mock.calls[0][0];
    expect(callUrl).toContain('returnType=IRE');
  });

  it('throws validation error for invalid request', async () => {
    const http = createMockHttpClient({ body: [] });
    await expect(
      createReturns({ returns: 'not-an-array' } as any, { http, logger: createLogger() } as any, createResolveBaseUrl())
    ).rejects.toBeInstanceOf(CarrierError);
  });

  it('throws permanent error when HTTP client is missing', async () => {
    await expect(
      createReturns(baseReq as any, { logger: createLogger() } as any, createResolveBaseUrl())
    ).rejects.toBeInstanceOf(CarrierError);
  });
});

describe('createReturn', () => {
  it('delegates to createReturns and returns first result', async () => {
    const http = createMockHttpClient({
      body: [{ barcode: 'CLFOX0000000001', newBarcode: 'CLFOX0000000001-RET', created: true }],
    });

    const req = {
      return: { parcelCarrierId: 'CLFOX0000000001' },
      credentials: {
        apiKey: 'test-api-key',
        basicUsername: 'user',
        basicPassword: 'pass',
      },
    };

    const result = await createReturn(req as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.status).toBe('created');
    expect(result.carrierId).toBe('CLFOX0000000001-RET');
  });
});
