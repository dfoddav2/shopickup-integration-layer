/**
 * Live E2E test for Foxpost batch-track capability
 * Creates a parcel in the sandbox, then batch-tracks it.
 */

import { describe, expect, it } from 'vitest';
import type { Parcel } from '@shopickup/core';
import { getFoxpostLiveConfig } from './live-env.js';
import { pollWithRetries } from './live-test-utils.js';

function createLiveParcel(): Parcel {
  return {
    id: `live-bt-${Date.now()}`,
    shipper: {
      contact: {
        name: 'Shopickup Test Sender',
        phone: '+36301234567',
        email: 'sender@example.com',
      },
      address: {
        name: 'Shopickup Test Sender',
        street: '1 Test Street',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        phone: '+36301234567',
        email: 'sender@example.com',
      },
    },
    recipient: {
      contact: {
        name: 'Foxpost Live Recipient',
        phone: '+36309876543',
        email: 'recipient@example.com',
      },
      delivery: {
        method: 'HOME',
        address: {
          name: 'Foxpost Live Recipient',
          street: '2 Test Avenue',
          city: 'Budapest',
          postalCode: '1012',
          country: 'HU',
          phone: '+36309876543',
          email: 'recipient@example.com',
        },
      },
    },
    package: {
      weightGrams: 1000,
    },
    service: 'standard',
    references: {
      customerReference: `FOXPOST-BT-${Date.now()}`,
    },
  };
}

const live = getFoxpostLiveConfig();
if (!live.enabled) {
  describe.skip('Foxpost live batch-track flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, useTestApi } = live;

  describe('Foxpost live batch-track flow', () => {
    it('creates a parcel then batch-tracks it', async () => {
      const parcel = createLiveParcel();

      console.log('Foxpost live batch-track test config', {
        baseUrl: live.baseUrl,
        useTestApi: live.useTestApi,
        parcelId: parcel.id,
      });

      // Create the parcel
      const createdParcel = await adapter.createParcel!(
        {
          parcel,
          credentials,
          options: { useTestApi },
        },
        context,
      );

      console.log('Foxpost live createParcel result', createdParcel);
      expect(createdParcel.carrierId).toBeTruthy();

      // Foxpost test API may have a short lag before a newly created parcel
      // appears in the tracking system. We poll with a 15-second delay
      // and up to 4 attempts to give the carrier time to register it.
      const { result: batchTrackResult } = await pollWithRetries(
        () =>
          adapter.batchTrack!(
            {
              trackingNumbers: [createdParcel.carrierId!],
              credentials,
              options: { useTestApi },
            },
            context,
          ),
        { maxRetries: 4, retryDelayMs: 15_000 },
      );

      console.log('Foxpost live batchTrack result', batchTrackResult);

      expect(batchTrackResult.totalCount).toBe(1);
      expect(batchTrackResult.results).toHaveLength(1);

      const item = batchTrackResult.results[0];
      expect(item.trackingNumber).toBe(createdParcel.carrierId);
      // The item may be 'found' or 'not_found' depending on test API lag
      expect(['found', 'not_found']).toContain(item.status);
    });

    it('batch-tracks multiple parcels', async () => {
      const parcel1 = createLiveParcel();
      const parcel2 = createLiveParcel();

      // Create two parcels
      const created1 = await adapter.createParcel!(
        {
          parcel: parcel1,
          credentials,
          options: { useTestApi },
        },
        context,
      );
      const created2 = await adapter.createParcel!(
        {
          parcel: parcel2,
          credentials,
          options: { useTestApi },
        },
        context,
      );

      expect(created1.carrierId).toBeTruthy();
      expect(created2.carrierId).toBeTruthy();

      // Batch track both parcels
      const { result: batchTrackResult } = await pollWithRetries(
        () =>
          adapter.batchTrack!(
            {
              trackingNumbers: [created1.carrierId!, created2.carrierId!],
              credentials,
              options: { useTestApi },
            },
            context,
          ),
        { maxRetries: 4, retryDelayMs: 15_000 },
      );

      console.log('Foxpost live batchTrack multiple result', batchTrackResult);

      expect(batchTrackResult.totalCount).toBe(2);
      expect(batchTrackResult.results).toHaveLength(2);
    });
  });
}
