/**
 * Unit tests for batch-track capability
 */

import { describe, it, expect, vi } from 'vitest';
import { batchTrack } from '../../capabilities/batch-track.js';
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

describe('batchTrack', () => {
  const baseReq = {
    trackingNumbers: ['CLFOX0000000001', 'CLFOX0000000002'],
    credentials: {
      apiKey: 'test-api-key',
      basicUsername: 'user',
      basicPassword: 'pass',
    },
  };

  it('tracks multiple parcels successfully', async () => {
    const http = createMockHttpClient({
      body: [
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
      ],
    });

    const result = await batchTrack(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

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

    // Events should be in chronological order (CREATE before RECEIVE after reverse)
    expect(first.update!.events[0].timestamp < first.update!.events[1].timestamp).toBe(true);
    expect(first.update!.events[0].status).toBe('PENDING');   // CREATE
    expect(first.update!.events[1].status).toBe('DELIVERED'); // RECEIVE
  });

  it('marks parcel with empty statuses as not_found', async () => {
    const http = createMockHttpClient({
      body: [
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
      ],
    });

    const result = await batchTrack(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.successCount).toBe(1);
    expect(result.results[0].status).toBe('not_found');
    expect(result.results[1].status).toBe('found');
  });

  it('handles missing barcode in response item', async () => {
    const http = createMockHttpClient({
      body: [{ statuses: [{ trackId: 1, status: 'CREATE', statusDate: '2024-01-15T10:00:00Z' }] }],
    });

    const result = await batchTrack(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].error).toBeDefined();
    expect(result.results[0].error!.code).toBe('MISSING_BARCODE');
  });

  it('throws validation error for invalid request', async () => {
    const http = createMockHttpClient({ body: [] });
    await expect(
      batchTrack({ trackingNumbers: 'not-an-array' } as any, { http, logger: createLogger() } as any, createResolveBaseUrl())
    ).rejects.toBeInstanceOf(CarrierError);
  });

  it('throws permanent error when HTTP client is missing', async () => {
    await expect(
      batchTrack(baseReq as any, { logger: createLogger() } as any, createResolveBaseUrl())
    ).rejects.toBeInstanceOf(CarrierError);
  });

  it('sends tracking numbers as request body', async () => {
    const http = createMockHttpClient({ body: [] });
    await batchTrack(baseReq as any, { http, logger: createLogger() } as any, createResolveBaseUrl());

    const callBody = (http.post as any).mock.calls[0][1];
    expect(callBody).toEqual(['CLFOX0000000001', 'CLFOX0000000002']);
  });
});
