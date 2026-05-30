/**
 * Mock integration tests for Foxpost create-return capabilities
 * Tests createReturn and createReturns via mock HTTP client
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FoxpostAdapter } from '../../index.js';
import type { AdapterContext, CreateReturnRequest, CreateReturnsRequest } from '@shopickup/core';

class MockHttpClientReturn {
  lastUrl?: string;
  lastData?: any;
  lastOptions?: any;
  responseBody: any = null;

  async post<T>(url: string, data?: any, options?: any): Promise<T> {
    this.lastUrl = url;
    this.lastData = data;
    this.lastOptions = options;
    return {
      status: 200,
      headers: {},
      body: this.responseBody,
    } as unknown as T;
  }

  async get<T>(_url: string, _options?: any): Promise<T> {
    throw new Error("GET not implemented in mock");
  }

  async put<T>(_url: string, _data?: any, _options?: any): Promise<T> {
    throw new Error("PUT not implemented in mock");
  }

  async patch<T>(_url: string, _data?: any, _options?: any): Promise<T> {
    throw new Error("PATCH not implemented in mock");
  }

  async delete<T>(_url: string, _options?: any): Promise<T> {
    throw new Error("DELETE not implemented in mock");
  }
}

describe('FoxpostAdapter createReturn', () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClientReturn;
  let ctx: AdapterContext;

  const credentials = {
    apiKey: 'test-api-key',
    basicUsername: 'user',
    basicPassword: 'pass',
  };

  beforeEach(() => {
    adapter = new FoxpostAdapter('https://webapi.foxpost.hu');
    mockHttp = new MockHttpClientReturn();
    ctx = { http: mockHttp as any, logger: console };
  });

  it('creates a single return successfully', async () => {
    mockHttp.responseBody = [
      { barcode: 'CLFOX0000000001', newBarcode: 'CLFOX0000000001-RET', created: true },
    ];

    const req: CreateReturnRequest = {
      return: {
        parcelCarrierId: 'CLFOX0000000001',
      },
      credentials,
    };

    const result = await adapter.createReturn!(req, ctx);

    expect(result.status).toBe('created');
    expect(result.carrierId).toBe('CLFOX0000000001-RET');
    expect(mockHttp.lastUrl).toContain('/api/re/ext');
    expect(mockHttp.lastUrl).toContain('returnType=RE');
  });

  it('uses IRE return type when specified', async () => {
    mockHttp.responseBody = [
      { barcode: 'CLFOX0000000001', newBarcode: 'CLFOX0000000001-IRE', created: true },
    ];

    const req: CreateReturnRequest = {
      return: {
        parcelCarrierId: 'CLFOX0000000001',
      },
      credentials,
      options: { foxpost: { returnType: 'IRE' as const } },
    };

    await adapter.createReturn!(req, ctx);

    expect(mockHttp.lastUrl).toContain('returnType=IRE');
  });

  it('sends uniqueBarcode and refCode in request body', async () => {
    mockHttp.responseBody = [
      { barcode: 'CLFOX0000000001', newBarcode: 'CLFOX0000000001-RET', created: true },
    ];

    const req: CreateReturnRequest = {
      return: {
        parcelCarrierId: 'CLFOX0000000001',
        uniqueBarcode: 'UB123',
        refCode: 'REF-001',
      },
      credentials,
    };

    await adapter.createReturn!(req, ctx);

    expect(mockHttp.lastData).toBeDefined();
    expect(mockHttp.lastData).toHaveLength(1);
    expect(mockHttp.lastData[0]).toMatchObject({
      barcode: 'CLFOX0000000001',
      uniqueBarcode: 'UB123',
      refCode: 'REF-001',
    });
  });
});

describe('FoxpostAdapter createReturns', () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClientReturn;
  let ctx: AdapterContext;

  const credentials = {
    apiKey: 'test-api-key',
    basicUsername: 'user',
    basicPassword: 'pass',
  };

  beforeEach(() => {
    adapter = new FoxpostAdapter('https://webapi.foxpost.hu');
    mockHttp = new MockHttpClientReturn();
    ctx = { http: mockHttp as any, logger: console };
  });

  it('creates multiple returns in one batch', async () => {
    mockHttp.responseBody = [
      { barcode: 'CLFOX0000000001', newBarcode: 'CLFOX0000000001-RET', created: true },
      { barcode: 'CLFOX0000000002', newBarcode: 'CLFOX0000000002-RET', created: true },
    ];

    const req: CreateReturnsRequest = {
      returns: [
        { parcelCarrierId: 'CLFOX0000000001' },
        { parcelCarrierId: 'CLFOX0000000002', refCode: 'REF-002' },
      ],
      credentials,
    };

    const result = await adapter.createReturns!(req, ctx);

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.allSucceeded).toBe(true);
    expect(mockHttp.lastUrl).toContain('/api/re/exts');
    expect(mockHttp.lastData).toHaveLength(2);
  });

  it('handles partial failures in batch', async () => {
    mockHttp.responseBody = [
      { barcode: 'CLFOX0000000001', newBarcode: 'CLFOX0000000001-RET', created: true },
      { barcode: 'CLFOX0000000002', errors: [{ field: 'barcode', message: 'INVALID_BARCODE' }] },
    ];

    const req: CreateReturnsRequest = {
      returns: [
        { parcelCarrierId: 'CLFOX0000000001' },
        { parcelCarrierId: 'CLFOX0000000002' },
      ],
      credentials,
    };

    const result = await adapter.createReturns!(req, ctx);

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.someFailed).toBe(true);
    expect(result.results[1].status).toBe('failed');
  });

  it('handles all failures in batch', async () => {
    mockHttp.responseBody = [
      { barcode: 'CLFOX0000000001', errors: [{ message: 'INVALID' }] },
      { barcode: 'CLFOX0000000002', errors: [{ message: 'INVALID' }] },
    ];

    const req: CreateReturnsRequest = {
      returns: [
        { parcelCarrierId: 'CLFOX0000000001' },
        { parcelCarrierId: 'CLFOX0000000002' },
      ],
      credentials,
    };

    const result = await adapter.createReturns!(req, ctx);

    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(2);
    expect(result.allFailed).toBe(true);
  });

  it('includes auth headers in request', async () => {
    mockHttp.responseBody = [];

    const req: CreateReturnsRequest = {
      returns: [{ parcelCarrierId: 'CLFOX0000000001' }],
      credentials,
    };

    await adapter.createReturns!(req, ctx);

    expect(mockHttp.lastOptions).toBeDefined();
    expect(mockHttp.lastOptions.headers).toBeDefined();
    expect(mockHttp.lastOptions.headers['Api-key']).toBe('test-api-key');
  });

  it('handles PROCESS_NOT_IMPLEMENTED_YET sandbox error', async () => {
    // Foxpost test API returns this for return creation — undocumented sandbox limitation
    mockHttp.responseBody = [
      {
        barcode: 'CLFOX0000000001',
        uniqueBarcode: null,
        refCode: 'RET-001',
        errors: [{ field: 'parcel', message: 'PROCESS_NOT_IMPLEMENTED_YET' }],
        newBarcode: null,
        created: false,
      },
    ];

    const req: CreateReturnsRequest = {
      returns: [{ parcelCarrierId: 'CLFOX0000000001' }],
      credentials,
    };

    const result = await adapter.createReturns!(req, ctx);

    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(1);
    expect(result.allFailed).toBe(true);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].errors).toBeDefined();
    expect(result.results[0].errors![0].code).toBe('PROCESS_NOT_IMPLEMENTED_YET');
    expect(result.results[0].errors![0].message).toContain("Field 'parcel': PROCESS_NOT_IMPLEMENTED_YET");
  });
});
