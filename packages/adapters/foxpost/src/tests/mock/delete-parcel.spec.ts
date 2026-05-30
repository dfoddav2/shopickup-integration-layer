/**
 * Mock integration tests for Foxpost delete-parcel capability
 * Tests the full adapter method via a mock HTTP client
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FoxpostAdapter } from '../../index.js';
import type { AdapterContext, DeleteParcelRequest } from '@shopickup/core';

class MockHttpClientDeleteParcel {
  lastUrl?: string;
  lastOptions?: any;
  responseCode: number = 204;
  responseBody: any = null;

  async delete<T>(url: string, options?: any): Promise<T> {
    this.lastUrl = url;
    this.lastOptions = options;
    return {
      status: this.responseCode,
      headers: {},
      body: this.responseBody,
    } as unknown as T;
  }

  async get<T>(_url: string, _options?: any): Promise<T> {
    throw new Error("GET not implemented in mock");
  }

  async post<T>(_url: string, _data?: any, _options?: any): Promise<T> {
    throw new Error("POST not implemented in mock");
  }

  async put<T>(_url: string, _data?: any, _options?: any): Promise<T> {
    throw new Error("PUT not implemented in mock");
  }

  async patch<T>(_url: string, _data?: any, _options?: any): Promise<T> {
    throw new Error("PATCH not implemented in mock");
  }
}

describe('FoxpostAdapter deleteParcel', () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClientDeleteParcel;
  let ctx: AdapterContext;

  const credentials = {
    apiKey: 'test-api-key',
    basicUsername: 'user',
    basicPassword: 'pass',
  };

  const baseReq: DeleteParcelRequest = {
    parcelCarrierId: 'CLFOX0000000001',
    credentials,
  };

  beforeEach(() => {
    adapter = new FoxpostAdapter('https://webapi.foxpost.hu');
    mockHttp = new MockHttpClientDeleteParcel();
    ctx = { http: mockHttp as any, logger: console };
  });

  it('deletes a parcel successfully (HTTP 204)', async () => {
    mockHttp.responseCode = 204;

    const result = await adapter.deleteParcel!(baseReq, ctx);

    expect(result.status).toBe('deleted');
    expect(result.carrierId).toBe('CLFOX0000000001');
    expect(mockHttp.lastUrl).toContain('/api/parcel/CLFOX0000000001');
    expect(mockHttp.lastUrl).toContain('isWeb=true');
  });

  it('deletes a parcel successfully (HTTP 200)', async () => {
    mockHttp.responseCode = 200;

    const result = await adapter.deleteParcel!(baseReq, ctx);

    expect(result.status).toBe('deleted');
    expect(result.carrierId).toBe('CLFOX0000000001');
  });

  it('uses isWeb=false when options specify it', async () => {
    mockHttp.responseCode = 204;
    const req = {
      ...baseReq,
      options: { foxpost: { isWeb: false } },
    };

    await adapter.deleteParcel!(req, ctx);

    expect(mockHttp.lastUrl).toContain('isWeb=false');
  });

  it('returns failed status on HTTP 400', async () => {
    mockHttp.responseCode = 400;
    mockHttp.responseBody = { error: 'INVALID_BARCODE', status: 400 };

    const result = await adapter.deleteParcel!(baseReq, ctx);

    expect(result.status).toBe('failed');
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('returns failed status on HTTP 401', async () => {
    mockHttp.responseCode = 401;
    mockHttp.responseBody = { error: 'WRONG_USERNAME_OR_PASSWORD', status: 401 };

    const result = await adapter.deleteParcel!(baseReq, ctx);

    expect(result.status).toBe('failed');
    expect(result.errors).toBeDefined();
    expect(result.errors![0].code).toBe('Auth');
  });

  it('includes api-key header in request', async () => {
    mockHttp.responseCode = 204;

    await adapter.deleteParcel!(baseReq, ctx);

    expect(mockHttp.lastOptions).toBeDefined();
    expect(mockHttp.lastOptions.headers).toBeDefined();
    expect(mockHttp.lastOptions.headers['Api-key']).toBe('test-api-key');
  });
});
