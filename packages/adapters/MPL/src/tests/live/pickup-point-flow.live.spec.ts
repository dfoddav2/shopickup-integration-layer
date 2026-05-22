import { describe, expect, it } from 'vitest';
import type { Parcel, PickupPoint, Address } from '@shopickup/core';
import { getMPLLiveConfig, exchangeMPLToken } from './live-env.js';

function createPickupPointParcel(pickupPoint: PickupPoint): Parcel {
  // MPL requires a full address for pickup-point deliveries even though the
  // core types make it optional. Build it from the fetched point data.
  const pickupAddress: Address = {
    name: pickupPoint.name || 'MPL Pickup Point',
    street: pickupPoint.address || 'Unknown',
    city: pickupPoint.city || 'Budapest',
    postalCode: pickupPoint.postalCode || '0000',
    country: pickupPoint.country || 'HU',
  };

  return {
    id: `mpl-live-pp-${Date.now()}`,
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
        name: 'MPL Live Pickup Recipient',
        phone: '+36201234567',
        email: 'recipient@example.hu',
      },
      delivery: {
        method: 'PICKUP_POINT',
        pickupPoint: {
          id: pickupPoint.id,
          provider: 'mpl',
          name: pickupPoint.name || 'MPL Test Pickup Point',
          address: pickupAddress,
        },
      },
    },
    package: {
      weightGrams: 900,
      dimensionsCm: { length: 25, width: 15, height: 8 },
    },
    service: 'standard',
    references: {
      customerReference: `MPL-LIVE-PP-${Date.now()}`,
    },
  };
}

const live = await getMPLLiveConfig();

if (!live.enabled) {
  describe.skip('MPL live pickup-point flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, baseUrl } = live;

  describe('MPL live pickup-point flow', () => {
    it('creates a pickup-point parcel, generates a label, and tracks it in the sandbox', async () => {
      const accessToken = await exchangeMPLToken(live);
      console.log('MPL live auth token obtained', { hasToken: !!accessToken });

      const oauthCredentials = {
        authType: 'oauth2' as const,
        oAuth2Token: accessToken,
      };
      const useTestApi = baseUrl.includes('sandbox');

      // Fetch a real pickup point from the MPL API so we use a valid ID
      const pickupPointsResponse = await adapter.fetchPickupPoints!(
        {
          credentials: oauthCredentials,
          options: {
            useTestApi,
            mpl: {
              accountingCode: credentials.accountingCode,
              postCode: '1123',
              city: 'Budapest',
              servicePointType: ['CS', 'PP'],
            },
          },
        },
        context,
      );
      expect(pickupPointsResponse.points.length).toBeGreaterThan(0);

      const pickupPoint = pickupPointsResponse.points[0];
      console.log('MPL live selected pickup point', {
        id: pickupPoint.id,
        name: pickupPoint.name,
        address: pickupPoint.address,
      });

      const parcel = createPickupPointParcel(pickupPoint);

      console.log('MPL live pickup-point test config', {
        useTestApi,
        pickupPointId: pickupPoint.id,
        parcelId: parcel.id,
        customerReference: parcel.references?.customerReference,
      });

      const createdParcel = await adapter.createParcel!(
        {
          parcel,
          credentials: oauthCredentials,
          options: {
            useTestApi,
            mpl: {
              accountingCode: credentials.accountingCode,
              agreementCode: credentials.agreementCode,
              bankAccountNumber: credentials.bankAccountNumber,
            },
          },
        },
        context,
      );

      console.log('MPL live pickup-point createParcel result', createdParcel);

      expect(createdParcel.carrierId).toBeTruthy();
      expect(createdParcel.status).toBe('created');

      const label = await adapter.createLabel!(
        {
          parcelCarrierId: createdParcel.carrierId!,
          credentials: oauthCredentials,
          options: {
            useTestApi,
            mpl: {
              accountingCode: credentials.accountingCode,
              labelFormat: 'PDF',
              singleFile: true,
            },
          },
        },
        context,
      );

      console.log('MPL live pickup-point createLabel result', label);

      expect(label.status).toBe('created');
      expect(label.fileId).toBeTruthy();

      // MPL requires parcels to be closed before they become trackable.
      const closeResult = await adapter.closeShipments!(
        {
          trackingNumbers: [createdParcel.carrierId!],
          credentials: oauthCredentials,
          options: {
            useTestApi,
            mpl: { accountingCode: credentials.accountingCode },
          },
        },
        context,
      );

      console.log('MPL live pickup-point closeShipments result', closeResult);

      // NOTE: MPL sandbox tracking uses a separate mock backend.
      // Parcels created via the shipment API do NOT automatically appear
      // in the tracking sandbox. Only hardcoded mock IDs return data.
      // See tracking.live.spec.ts for tests against known mock IDs.
      try {
        const tracking = await adapter.track!(
          {
            trackingNumber: createdParcel.carrierId!,
            credentials: oauthCredentials,
            options: { useTestApi },
          },
          context,
        );
        console.log('MPL live pickup-point track result', tracking);
        expect(tracking.trackingNumber).toBe(createdParcel.carrierId!);
        expect(tracking.status).toBeTruthy();
      } catch (error: any) {
        if (error.category === 'NotFound') {
          console.log(
            'MPL live pickup-point: tracking returned NotFound for freshly created parcel (expected sandbox limitation)'
          );
        } else {
          throw error;
        }
      }
    });
  });
}
