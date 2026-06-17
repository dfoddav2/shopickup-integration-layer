import { describe, expect, it } from 'vitest';
import type { Parcel, PickupPoint } from '@shopickup/core';
import { getGLSLiveConfig } from './live-env.js';
import { pollWithRetries } from './live-test-utils.js';

function createPickupPointParcel(pickupPoint: PickupPoint): Parcel {
  // GLS PSD service expects the pickup point ID in number-PARCELSHOP format
  // (e.g. "379-PARCELSHOP").  We derive it from the raw GLS goldId when
  // available, otherwise fall back to the canonical id.
  const raw = (pickupPoint.raw || {}) as any;
  const psdId = raw.goldId ? `${raw.goldId}-PARCELSHOP` : pickupPoint.id;

  return {
    id: `gls-live-pp-${Date.now()}`,
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
        name: 'GLS Live Pickup Recipient',
        phone: '+36201234567',
        email: 'recipient@example.hu',
      },
      delivery: {
        method: 'PICKUP_POINT',
        pickupPoint: {
          id: psdId,
          provider: 'gls',
          name: pickupPoint.name || 'Pickup Point',
          // Use the real pickup point address from the public feed so GLS
          // does not reject the parcel for invalid delivery address data.
          address: {
            name: pickupPoint.name || 'Pickup Point',
            street: pickupPoint.street || '',
            city: pickupPoint.city || '',
            postalCode: pickupPoint.postalCode || '',
            country: (pickupPoint.country || 'HU').toUpperCase(),
          },
        },
      },
    },
    package: {
      weightGrams: 900,
    },
    service: 'standard',
    references: {
      customerReference: `GLS-LIVE-PP-${Date.now()}`,
    },
  };
}

const live = getGLSLiveConfig();

if (!live.enabled) {
  describe.skip('GLS live pickup-point flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, useTestApi, country } = live;

  describe('GLS live pickup-point flow', () => {
    it('creates a pickup-point parcel, generates a label, and tracks it in the test environment', async () => {
      // Fetch a real pickup point from the GLS public feed so we use a
      // valid ID and address that exist in GLS's system.
      const pickupPointsResponse = await adapter.fetchPickupPoints!(
        { options: { gls: { country } } },
        context,
      );
      expect(pickupPointsResponse.points.length).toBeGreaterThan(0);

      const pickupPoint = pickupPointsResponse.points[0];
      console.log('GLS live selected pickup point', {
        id: pickupPoint.id,
        name: pickupPoint.name,
        address: pickupPoint.address,
      });

      const parcel = createPickupPointParcel(pickupPoint);

      console.log('GLS live pickup-point test config', {
        useTestApi,
        country,
        pickupPointId: pickupPoint.id,
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

      console.log('GLS live pickup-point createParcel result', createdParcel);

      // The GLS test environment does not support the PSD (Parcel Shop
      // Delivery) service for all accounts.  When PSD is unsupported the
      // API returns error code 13.  We accept that as a known test-env
      // limitation and stop the test early rather than failing.
      if (createdParcel.status === 'failed') {
        const hasPsdError = createdParcel.errors?.some(
          (e: any) => e.message?.includes("PSD") || e.code === '13'
        );
        if (hasPsdError) {
          console.log('GLS live pickup-point PSD not supported on test API – skipping remainder of test');
          expect(createdParcel.errors).toBeTruthy();
          return;
        }
      }

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

      console.log('GLS live pickup-point createLabel result', label);

      expect(label.status).toBe('created');
      expect(label.fileId).toBeTruthy();

      // GLS tracking requires the ParcelNumber, which is in raw.parcelNumber
      const parcelNumber = (label.raw as any)?.parcelNumber!;
      console.log('GLS live pickup-point using tracking number', { parcelNumber });

      // GLS test API has a ~30 second lag before a newly created parcel
      // appears in the tracking system. We poll with a 15-second delay
      // and up to 6 attempts (90 s total).  If the parcel still cannot be
      // found we treat that as an acceptable outcome for a fresh test parcel.
      let tracking: any;
      try {
        const pollResult = await pollWithRetries(
          () =>
            adapter.track!(
              {
                trackingNumber: String(parcelNumber),
                credentials,
                options: { useTestApi, country },
              },
              context,
            ),
          { maxRetries: 6, retryDelayMs: 15_000 },
        );
        tracking = pollResult.result;
        console.log('GLS live pickup-point track result', tracking);
        expect(tracking.trackingNumber).toBe(String(parcelNumber));
        expect(tracking.status).toBeTruthy();
      } catch (err: any) {
        console.log('GLS live pickup-point track error (expected for fresh test parcel)', err.message);
        expect(err.category).toBe('NotFound');
      }
    });
  });
}
