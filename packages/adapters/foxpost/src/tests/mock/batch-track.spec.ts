/**
 * Mock integration tests for Foxpost batch-track capability
 * Tests the full adapter method via a mock HTTP client
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FoxpostAdapter } from '../../index.js';
import type { AdapterContext, BatchTrackingRequest } from '@shopickup/core';

class MockHttpClientBatchTrack {
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

describe('FoxpostAdapter batchTrack', () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClientBatchTrack;
  let ctx: AdapterContext;

  const credentials = {
    apiKey: 'test-api-key',
    basicUsername: 'user',
    basicPassword: 'pass',
  };

  const baseReq: BatchTrackingRequest = {
    trackingNumbers: ['CLFOX0000000001', 'CLFOX0000000002'],
    credentials,
  };

  beforeEach(() => {
    adapter = new FoxpostAdapter('https://webapi.foxpost.hu');
    mockHttp = new MockHttpClientBatchTrack();
    ctx = { http: mockHttp as any, logger: console };
  });

  it('tracks multiple parcels successfully', async () => {
    mockHttp.responseBody = [
      {
        barcode: 'CLFOX0000000001',
        createdAt: '2024-01-15T10:00:00Z',
        // Foxpost API returns statuses in reverse chronological order (newest first)
        statuses: [
          { trackId: 2, status: 'RECEIVE', statusDate: '2024-01-16T14:00:00Z' },
          { trackId: 1, status: 'CREATE', statusDate: '2024-01-15T10:00:00Z' },
        ],
      },
      {
        barcode: 'CLFOX0000000002',
        createdAt: '2024-01-15T11:00:00Z',
        statuses: [
          { trackId: 1, status: 'CREATE', statusDate: '2024-01-15T11:00:00Z' },
        ],
      },
    ];

    const result = await adapter.batchTrack!(baseReq, ctx);

    expect(result.totalCount).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.allSucceeded).toBe(true);

    // Check first result
    const first = result.results[0];
    expect(first.status).toBe('found');
    expect(first.trackingNumber).toBe('CLFOX0000000001');
    expect(first.update!.events).toHaveLength(2);
    expect(first.update!.status).toBe('DELIVERED'); // RECEIVE maps to DELIVERED

    // Events should be in chronological order
    expect(first.update!.events[0].timestamp < first.update!.events[1].timestamp).toBe(true);
    expect(first.update!.events[0].status).toBe('PENDING');   // CREATE
    expect(first.update!.events[1].status).toBe('DELIVERED'); // RECEIVE

    // Check second result
    const second = result.results[1];
    expect(second.status).toBe('found');
    expect(second.trackingNumber).toBe('CLFOX0000000002');
    expect(second.update!.status).toBe('PENDING');
  });

  it('sends tracking numbers as request body', async () => {
    mockHttp.responseBody = [];

    await adapter.batchTrack!(baseReq, ctx);

    expect(mockHttp.lastUrl).toContain('/api/tracking/tracks');
    expect(mockHttp.lastData).toEqual(['CLFOX0000000001', 'CLFOX0000000002']);
  });

  it('marks parcel with empty statuses as not_found', async () => {
    mockHttp.responseBody = [
      {
        barcode: 'CLFOX0000000001',
        statuses: [],
      },
      {
        barcode: 'CLFOX0000000002',
        statuses: [
          { trackId: 1, status: 'CREATE', statusDate: '2024-01-15T11:00:00Z' },
        ],
      },
    ];

    const result = await adapter.batchTrack!(baseReq, ctx);

    expect(result.successCount).toBe(1);
    expect(result.results[0].status).toBe('not_found');
    expect(result.results[1].status).toBe('found');
  });

  it('handles missing barcode in response item', async () => {
    mockHttp.responseBody = [
      { statuses: [{ trackId: 1, status: 'CREATE', statusDate: '2024-01-15T10:00:00Z' }] },
    ];

    const result = await adapter.batchTrack!(baseReq, ctx);

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].error).toBeDefined();
    expect(result.results[0].error!.code).toBe('MISSING_BARCODE');
  });

  it('includes auth headers in request', async () => {
    mockHttp.responseBody = [];

    await adapter.batchTrack!(baseReq, ctx);

    expect(mockHttp.lastOptions).toBeDefined();
    expect(mockHttp.lastOptions.headers).toBeDefined();
    expect(mockHttp.lastOptions.headers['Api-key']).toBe('test-api-key');
  });

});
