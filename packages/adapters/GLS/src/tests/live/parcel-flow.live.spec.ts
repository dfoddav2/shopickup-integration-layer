import { describe, expect, it } from 'vitest';
import type { Parcel } from '@shopickup/core';
import { getGLSLiveConfig } from './live-env.js';

function createHomeDeliveryParcel(): Parcel {
  return {
    id: `gls-live-${Date.now()}`,
    shipper: {
      contact: {
        name: 'Shopickup Test Sender',
        phone: '+36301234567',
        email: 'sender@example.com',
      },
      address: {
        name: 'Shopickup Test Sender',
        street: 'Alkotas utca 10',
        city: 'Budapest',
        postalCode: '1123',
        country: 'HU',
        phone: '+36301234567',
        email: 'sender@example.com',
      },
    },
    recipient: {
      contact: {
        name: 'GLS Live Recipient',
        phone: '+36201234567',
        email: 'recipient@example.hu',
      },
      delivery: {
        method: 'HOME',
        address: {
          name: 'GLS Live Recipient',
          street: 'Kossuth Lajos utca 14',
          city: 'Siofok',
          postalCode: '8600',
          country: 'HU',
          phone: '+36201234567',
          email: 'recipient@example.hu',
        },
      },
    },
    package: {
      weightGrams: 1200,
      dimensionsCm: { length: 30, width: 20, height: 10 },
    },
    service: 'standard',
    references: {
      customerReference: `GLS-LIVE-${Date.now()}`,
    },
  };
}

const live = getGLSLiveConfig();

if (!live.enabled) {
  describe.skip('GLS live parcel flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, useTestApi, country } = live;

  describe('GLS live parcel flow', () => {
    it('creates a parcel, generates a label, and tracks it in the test environment', async () => {
      const parcel = createHomeDeliveryParcel();

      console.log('GLS live test config', {
        useTestApi,
        country,
        parcelId: parcel.id,
        customerReference: parcel.references?.customerReference,
      });

      const createdParcel = await adapter.createParcel!(
        {
          parcel,
          credentials,
          options: { useTestApi, country },
        },
        context,
      );

      console.log('GLS live createParcel result', createdParcel);

      expect(createdParcel.carrierId).toBeTruthy();
      expect(createdParcel.status).toBe('created');

      const label = await adapter.createLabel!(
        {
          parcelCarrierId: createdParcel.carrierId!,
          credentials,
          options: { useTestApi, gls: { country } },
        },
        context,
      );

      console.log('GLS live createLabel result', label);

      expect(label.status).toBe('created');
      expect(label.fileId).toBeTruthy();

      // Tracking may return NotFound for a freshly created test parcel;
      // accept either a valid tracking response or a NotFound error.
      let tracking: any;
      try {
        tracking = await adapter.track!(
          {
            trackingNumber: createdParcel.carrierId!,
            credentials,
            options: { useTestApi, country },
          },
          context,
        );
        console.log('GLS live track result', tracking);
        expect(tracking.trackingNumber).toBe(createdParcel.carrierId!);
        expect(tracking.status).toBeTruthy();
      } catch (err: any) {
        console.log('GLS live track error (expected for fresh test parcel)', err.message);
        // NotFound is expected when the test API hasn't synced the parcel yet
        expect(err.category).toBe('NotFound');
      }
    });
  });
}
