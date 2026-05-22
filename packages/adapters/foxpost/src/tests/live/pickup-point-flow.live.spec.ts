import { describe, expect, it } from 'vitest';
import type { Parcel } from '@shopickup/core';
import { getFoxpostLiveConfig } from './live-env.js';
import { pollWithRetries } from './live-test-utils.js';

function createPickupPointParcel(pickupPointId: string): Parcel {
  return {
    id: `live-apm-${Date.now()}`,
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
        name: 'Foxpost Live Pickup Recipient',
        phone: '+36309876543',
        email: 'recipient@example.com',
      },
      delivery: {
        method: 'PICKUP_POINT',
        pickupPoint: {
          id: pickupPointId,
          provider: 'foxpost',
          name: 'Foxpost Example Pickup Point',
          type: 'LOCKER',
        },
      },
    },
    package: {
      weightGrams: 1000,
    },
    service: 'standard',
    references: {
      customerReference: `FOXPOST-LIVE-APM-${Date.now()}`,
    },
  };
}

const live = getFoxpostLiveConfig();
if (!live.enabled) {
  describe.skip('Foxpost live pickup-point flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, useTestApi } = live;

  describe('Foxpost live pickup-point flow', () => {
    it('creates a pickup-point parcel, labels it, and tracks it in the sandbox', async () => {
      const parcel = createPickupPointParcel(live.pickupPointId);

      console.log('Foxpost live pickup-point test config', {
        baseUrl: live.baseUrl,
        useTestApi: live.useTestApi,
        parcelId: parcel.id,
        pickupPointId: live.pickupPointId,
        customerReference: parcel.references?.customerReference,
      });

      const createdParcel = await adapter.createParcel!(
        {
          parcel,
          credentials,
          options: { useTestApi },
        },
        context,
      );

      console.log('Foxpost live pickup-point createParcel result', createdParcel);

      expect(createdParcel.carrierId).toBeTruthy();

      const label = await adapter.createLabel!(
        {
          parcelCarrierId: createdParcel.carrierId!,
          credentials,
          options: { useTestApi },
        },
        context,
      );

      console.log('Foxpost live pickup-point createLabel result', label);

      expect(label.status).toBe('created');
      expect(label.fileId).toBeTruthy();

      // Foxpost test API may have a short lag before a newly created parcel
      // appears in the tracking system. We poll with a 15-second delay
      // and up to 4 attempts to give the carrier time to register it.
      const { result: tracking } = await pollWithRetries(
        () =>
          adapter.track!(
            {
              trackingNumber: createdParcel.carrierId!,
              credentials,
              options: { useTestApi },
            },
            context,
          ),
        { maxRetries: 4, retryDelayMs: 15_000 },
      );

      console.log('Foxpost live pickup-point track result', tracking);

      expect(tracking.trackingNumber).toBe(createdParcel.carrierId!);
      expect(tracking.status).toBeTruthy();
    });
  });
}
