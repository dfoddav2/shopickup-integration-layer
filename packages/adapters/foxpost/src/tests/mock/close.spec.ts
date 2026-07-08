/**
 * Mock integration tests for Foxpost closeShipments capability
 * Tests the full adapter method via a mock HTTP client
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FoxpostAdapter } from '../../index.js';
import type { AdapterContext, CloseShipmentsRequest } from '@shopickup/core';

class MockHttpClientClose {
  lastUrl?: string;
  lastData?: any;
  lastOptions?: any;
  responseBody: any = null;
  shouldThrow: any = null;

  async post<T>(url: string, data?: any, options?: any): Promise<T> {
    this.lastUrl = url;
    this.lastData = data;
    this.lastOptions = options;
    if (this.shouldThrow) throw this.shouldThrow;
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

describe('FoxpostAdapter closeShipments', () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClientClose;
  let ctx: AdapterContext;

  const credentials = {
    apiKey: 'test-api-key',
    basicUsername: 'user',
    basicPassword: 'pass',
  };

  const baseReq: CloseShipmentsRequest = {
    trackingNumbers: ['CLFOX0000000001', 'CLFOX0000000002'],
    credentials,
    options: { foxpost: { sender: 'my-sender-account' } } as any,
  };

  beforeEach(() => {
    adapter = new FoxpostAdapter('https://webapi.foxpost.hu');
    mockHttp = new MockHttpClientClose();
    ctx = { http: mockHttp as any, logger: console };
  });

  it('generates a delivery note PDF covering all parcels', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4 fake pdf content');
    mockHttp.responseBody = pdfBytes;

    const result = await adapter.closeShipments!(baseReq, ctx);

    expect(result.totalCount).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.allSucceeded).toBe(true);
    expect(result.files).toHaveLength(1);

    const file = result.files![0];
    expect(file.contentType).toBe('application/pdf');
    expect(file.labelFormat).toBe('PDF');
    expect(file.byteLength).toBe(pdfBytes.byteLength);
    expect(file.rawBytes).toBe(pdfBytes);

    // Both results should reference the same single delivery note file
    expect(result.results[0].fileIds).toEqual([file.id]);
    expect(result.results[1].fileIds).toEqual([file.id]);
  });

  it('sends sender and clFoxCodes as request body', async () => {
    mockHttp.responseBody = Buffer.from('%PDF-1.4');

    await adapter.closeShipments!(baseReq, ctx);

    expect(mockHttp.lastUrl).toContain('/api/label/deliveryNote');
    expect(mockHttp.lastData).toEqual({
      sender: 'my-sender-account',
      clFoxCodes: ['CLFOX0000000001', 'CLFOX0000000002'],
    });
  });

  it('includes auth headers in request', async () => {
    mockHttp.responseBody = Buffer.from('%PDF-1.4');

    await adapter.closeShipments!(baseReq, ctx);

    expect(mockHttp.lastOptions).toBeDefined();
    expect(mockHttp.lastOptions.headers['Api-key']).toBe('test-api-key');
    expect(mockHttp.lastOptions.responseType).toBe('arraybuffer');
  });

  it('throws Validation error when sender option is missing', async () => {
    const reqWithoutSender: CloseShipmentsRequest = {
      trackingNumbers: ['CLFOX0000000001'],
      credentials,
    };

    await expect(adapter.closeShipments!(reqWithoutSender, ctx)).rejects.toMatchObject({
      category: 'Validation',
    });
  });

  it('throws Validation error when trackingNumbers is empty', async () => {
    const reqEmpty: CloseShipmentsRequest = {
      trackingNumbers: [],
      credentials,
      options: { foxpost: { sender: 'my-sender-account' } } as any,
    };

    await expect(adapter.closeShipments!(reqEmpty, ctx)).rejects.toMatchObject({
      category: 'Validation',
    });
  });

  it('propagates carrier errors on HTTP failure', async () => {
    mockHttp.shouldThrow = { response: { status: 401, data: Buffer.from('{}') } };

    await expect(adapter.closeShipments!(baseReq, ctx)).rejects.toMatchObject({
      category: 'Auth',
    });
  });
});
