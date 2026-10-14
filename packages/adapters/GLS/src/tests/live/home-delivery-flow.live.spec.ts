import { describe, expect, it } from 'vitest';
import type { Parcel } from '@shopickup/core';
import { getGLSLiveConfig } from './live-env.js';
import { pollWithRetries } from './live-test-utils.js';

// Destination fixtures for HU -> abroad runs (GLS_LIVE_DEST_COUNTRY). The
// endpoint stays GLS_LIVE_COUNTRY (HU by default): the account country, not
// the destination. Phone prefixes must match the destination country.
const DESTINATIONS: Record<string, { street: string; city: string; postalCode: string; phone: string }> = {
  HU: { street: 'Kossuth Lajos utca 14', city: 'Siofok', postalCode: '8600', phone: '+36201234567' },
  CZ: { street: 'Vaclavske namesti 1', city: 'Praha', postalCode: '11000', phone: '+420601234567' },
  SK: { street: 'Hlavna 1', city: 'Bratislava', postalCode: '81101', phone: '+421901234567' },
  RO: { street: 'Strada Victoriei 10', city: 'Bucuresti', postalCode: '010061', phone: '+40712345678' },
  HR: { street: 'Ilica 1', city: 'Zagreb', postalCode: '10000', phone: '+385911234567' },
  SI: { street: 'Slovenska cesta 1', city: 'Ljubljana', postalCode: '1000', phone: '+38631234567' },
  RS: { street: 'Knez Mihailova 1', city: 'Beograd', postalCode: '11000', phone: '+381601234567' },
};
const destCountry = (process.env.GLS_LIVE_DEST_COUNTRY || 'HU').toUpperCase();
const dest = DESTINATIONS[destCountry];

function createHomeDeliveryParcel(): Parcel {
  if (!dest) {
    throw new Error(`GLS_LIVE_DEST_COUNTRY=${destCountry} is not one of ${Object.keys(DESTINATIONS).join(', ')}`);
  }
  return {
    id: `gls-live-home-${Date.now()}`,
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
        phone: dest.phone,
        email: 'recipient@example.hu',
      },
      delivery: {
        method: 'HOME',
        address: {
          name: 'GLS Live Recipient',
          street: dest.street,
          city: dest.city,
          postalCode: dest.postalCode,
          country: destCountry,
          phone: dest.phone,
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
      customerReference: `GLS-LIVE-HOME-${Date.now()}`,
    },
  };
}

const live = getGLSLiveConfig();

if (!live.enabled) {
  describe.skip('GLS live home-delivery flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, useTestApi, country } = live;

  describe('GLS live home-delivery flow', () => {
    it('creates a home-delivery parcel, generates a label, and tracks it in the test environment', async () => {
      const parcel = createHomeDeliveryParcel();

      console.log('GLS live home-delivery test config', {
        useTestApi,
        country,
        destCountry,
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

      console.log('GLS live home-delivery createParcel result', createdParcel);

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

      console.log('GLS live home-delivery createLabel result', label);

      expect(label.status).toBe('created');
      expect(label.fileId).toBeTruthy();

      // GLS tracking requires the ParcelNumber, which is in raw.parcelNumber
      const parcelNumber = (label.raw as any)?.parcelNumber!;
      console.log('GLS live home-delivery using tracking number', { parcelNumber });

      // GLS test API has a ~30 second lag before a newly created parcel
      // appears in the tracking system. We poll with a 15-second delay
      // and up to 6 attempts (90 s total) to give the carrier time to
      // register it.  If the parcel still cannot be found we treat that
      // as an acceptable outcome for a freshly created test parcel.
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
        console.log('GLS live home-delivery track result', tracking);
        expect(tracking.trackingNumber).toBe(String(parcelNumber));
        expect(tracking.status).toBeTruthy();
      } catch (err: any) {
        console.log('GLS live home-delivery track error (expected for fresh test parcel)', err.message);
        expect(err.category).toBe('NotFound');
      }
    });
  });
}
