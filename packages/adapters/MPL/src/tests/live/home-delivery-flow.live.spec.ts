import { describe, expect, it } from 'vitest';
import type { Parcel } from '@shopickup/core';
import { getMPLLiveConfig, exchangeMPLToken } from './live-env.js';

function createHomeDeliveryParcel(): Parcel {
  return {
    id: `mpl-live-home-${Date.now()}`,
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
        name: 'MPL Live Recipient',
        phone: '+36201234567',
        email: 'recipient@example.hu',
      },
      delivery: {
        method: 'HOME',
        address: {
          name: 'MPL Live Recipient',
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
      customerReference: `MPL-LIVE-HOME-${Date.now()}`,
    },
  };
}

const live = await getMPLLiveConfig();

if (!live.enabled) {
  describe.skip('MPL live home-delivery flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, baseUrl } = live;

  describe('MPL live home-delivery flow', () => {
    it('creates a home-delivery parcel, generates a label, and tracks it in the sandbox', async () => {
      const accessToken = await exchangeMPLToken(live);
      console.log('MPL live auth token obtained', { hasToken: !!accessToken });

      const oauthCredentials = {
        authType: 'oauth2' as const,
        oAuth2Token: accessToken,
      };
      const useTestApi = baseUrl.includes('sandbox');
      const parcel = createHomeDeliveryParcel();

      console.log('MPL live home-delivery test config', {
        useTestApi,
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

      console.log('MPL live home-delivery createParcel result', createdParcel);

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

      console.log('MPL live home-delivery createLabel result', label);

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

      console.log('MPL live home-delivery closeShipments result', closeResult);

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
        console.log('MPL live home-delivery track result', tracking);
        expect(tracking.trackingNumber).toBe(createdParcel.carrierId!);
        expect(tracking.status).toBeTruthy();
      } catch (error: any) {
        if (error.category === 'NotFound') {
          console.log(
            'MPL live home-delivery: tracking returned NotFound for freshly created parcel (expected sandbox limitation)'
          );
        } else {
          throw error;
        }
      }
    });
  });
}
