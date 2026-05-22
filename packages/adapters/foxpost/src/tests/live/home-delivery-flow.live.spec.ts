import { describe, expect, it } from 'vitest';
import type { Parcel } from '@shopickup/core';
import { getFoxpostLiveConfig } from './live-env.js';

function createLiveParcel(): Parcel {
  return {
    id: `live-${Date.now()}`,
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
      customerReference: `FOXPOST-LIVE-${Date.now()}`,
    },
  };
}

const live = getFoxpostLiveConfig();
if (!live.enabled) {
  describe.skip('Foxpost live flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, useTestApi } = live;

  describe('Foxpost live flow', () => {
    it('creates a parcel, labels it, and tracks it in the sandbox', async () => {
      const parcel = createLiveParcel();

      console.log('Foxpost live test config', {
        baseUrl: live.baseUrl,
        useTestApi: live.useTestApi,
        parcelId: parcel.id,
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

      console.log('Foxpost live createParcel result', createdParcel);

      expect(createdParcel.carrierId).toBeTruthy();

      const label = await adapter.createLabel!(
        {
          parcelCarrierId: createdParcel.carrierId!,
          credentials,
          options: { useTestApi },
        },
        context,
      );

      console.log('Foxpost live createLabel result', label);

      expect(label.status).toBe('created');
      expect(label.fileId).toBeTruthy();

      const tracking = await adapter.track!(
        {
          trackingNumber: createdParcel.carrierId!,
          credentials,
          options: { useTestApi },
        },
        context,
      );

      console.log('Foxpost live track result', tracking);

      expect(tracking.trackingNumber).toBe(createdParcel.carrierId!);
      expect(tracking.status).toBeTruthy();
    });
  });
}
