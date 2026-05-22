import { describe, expect, it } from 'vitest';
import { GLSAdapter } from '../../index.js';
import { createFetchHttpClient } from '@shopickup/core';
import type { AdapterContext } from '@shopickup/core';
import type { GLSFetchPickupPointsRequest } from '../../capabilities/pickup-points.js';

const adapter = new GLSAdapter();

const ctx: AdapterContext = {
  http: createFetchHttpClient(),
  logger: console,
};

describe('GLS live pickup-points feed', () => {
  it('fetches pickup points for Hungary (HU)', async () => {
    const req: GLSFetchPickupPointsRequest = {
      options: {
        gls: { country: 'HU' },
      },
    }; 

    const response = await adapter.fetchPickupPoints(req, ctx);

    expect(response.points.length).toBeGreaterThan(0);
    expect(response.summary!.totalCount).toBe(response.points.length);

    const first = response.points[0];
    expect(first.id).toBeTruthy();
    expect(first.name).toBeTruthy();
    expect(first.country).toBe('hu');
    expect(first.latitude).toBeDefined();
    expect(first.longitude).toBeDefined();
  });

  it('fetches pickup points for Austria (AT)', async () => {
    const req: GLSFetchPickupPointsRequest = {
      options: {
        gls: { country: 'AT' },
      },
    };

    const response = await adapter.fetchPickupPoints(req, ctx);

    expect(response.points.length).toBeGreaterThan(0);
    expect(response.summary!.totalCount).toBe(response.points.length);

    const first = response.points[0];
    expect(first.country).toBe('at');
  });

  it('rejects unsupported country code', async () => {
    const req: GLSFetchPickupPointsRequest = {
      options: {
        gls: { country: 'XX' },
      },
    };

    await expect(adapter.fetchPickupPoints(req, ctx)).rejects.toThrow();
  });

  it('rejects missing country code', async () => {
    const req = {
      options: {
        gls: {},
      },
    } as unknown as GLSFetchPickupPointsRequest;

    await expect(adapter.fetchPickupPoints(req, ctx)).rejects.toThrow();
  });
});
