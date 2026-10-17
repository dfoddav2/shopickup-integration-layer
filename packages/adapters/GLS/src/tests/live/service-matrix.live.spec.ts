import { describe, expect, it } from 'vitest';
import type { Parcel } from '@shopickup/core';
import { getGLSLiveConfig } from './live-env.js';
import { GLS_SUPPORTED_COUNTRIES } from '../../constants.js';
import { isServiceAvailableForCountry } from '../../service-constraints.js';

/**
 * Re-checks `GLS_SERVICE_CONSTRAINTS[...].countries` against what GLS actually
 * does. For every destination country each service is sent on its own to
 * `PrepareLabels` (home delivery, labels are not needed) and the answer is
 * compared with what the table predicts. A mismatch means the table, or GLS,
 * changed: update the table and its provenance note in service-constraints.ts.
 *
 * It creates about 40 test parcels, so it only runs when asked:
 *   GLS_LIVE_SERVICE_MATRIX=true pnpm test:live service-matrix
 * Test API, HU account, HU sender (GLS_LIVE_COUNTRY=HU). Not a contract: the
 * results depend on the account's client setup.
 */

// Same destinations as the home-delivery live test; the phone prefix must match
// the destination because the adapter validates it for services with a phone.
const DESTINATIONS: Record<string, { street: string; city: string; postalCode: string; phone: string }> = {
  HU: { street: 'Kossuth Lajos utca 14', city: 'Siofok', postalCode: '8600', phone: '+36201234567' },
  CZ: { street: 'Vaclavske namesti 1', city: 'Praha', postalCode: '11000', phone: '+420601234567' },
  SK: { street: 'Hlavna 1', city: 'Bratislava', postalCode: '81101', phone: '+421901234567' },
  RO: { street: 'Strada Victoriei 10', city: 'Bucuresti', postalCode: '010061', phone: '+40712345678' },
  HR: { street: 'Ilica 1', city: 'Zagreb', postalCode: '10000', phone: '+385911234567' },
  SI: { street: 'Slovenska cesta 1', city: 'Ljubljana', postalCode: '1000', phone: '+38631234567' },
  RS: { street: 'Knez Mihailova 1', city: 'Beograd', postalCode: '11000', phone: '+381601234567' },
};

// Each service on its own; FSS needs FDS next to it. SRS is only tried where the
// adapter lets it through (HU and SI), so GLS gets to answer for both.
const SERVICES: { name: string; code: string; flags: Record<string, boolean>; only?: string[] }[] = [
  { name: 'FDS', code: 'FDS', flags: { flexDeliveryServiceEmailFDS: true } },
  { name: 'FSS (with FDS)', code: 'FSS', flags: { flexDeliveryServiceEmailFDS: true, flexDeliveryServiceSmsFSS: true } },
  { name: 'SM2', code: 'SM2', flags: { smsPreadviceSM2: true } },
  { name: '24H', code: '24H', flags: { guaranteed24H: true } },
  { name: 'CS1', code: 'CS1', flags: { contactServiceCS1: true } },
  { name: 'SRS', code: 'SRS', flags: { shopReturnServiceSRS: true }, only: ['HU', 'SI'] },
];

function homeParcel(country: string): Parcel {
  const dest = DESTINATIONS[country];
  return {
    id: `gls-matrix-${country}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    shipper: {
      contact: { name: 'Shopickup Test Sender', phone: '+36301234567', email: 'sender@example.com' },
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
      contact: { name: 'GLS Matrix Recipient', phone: dest.phone, email: 'recipient@example.hu' },
      delivery: {
        method: 'HOME',
        address: {
          name: 'GLS Matrix Recipient',
          street: dest.street,
          city: dest.city,
          postalCode: dest.postalCode,
          country,
          phone: dest.phone,
          email: 'recipient@example.hu',
        },
      },
    },
    package: { weightGrams: 1200, dimensionsCm: { length: 30, width: 20, height: 10 } },
    service: 'standard',
    references: { customerReference: `GLS-MATRIX-${country}-${Date.now()}` },
  } as Parcel;
}

const live = getGLSLiveConfig();
const enabled = process.env.GLS_LIVE_SERVICE_MATRIX === 'true';

if (!live.enabled || !enabled) {
  describe.skip('GLS live service matrix', () => {
    it(live.enabled ? 'Set GLS_LIVE_SERVICE_MATRIX=true to run it (creates about 40 test parcels).' : live.reason, () => {});
  });
} else {
  const { adapter, context, credentials, useTestApi, country: endpointCountry } = live;

  describe('GLS live service matrix', () => {
    it('GLS accepts a service for exactly the countries service-constraints.ts lists', async () => {
      const mismatches: string[] = [];

      for (const country of GLS_SUPPORTED_COUNTRIES) {
        for (const service of SERVICES) {
          if (service.only && !service.only.includes(country)) continue;
          const expected = isServiceAvailableForCountry(service.code, country);

          let accepted = false;
          let detail = '';
          try {
            const res = await adapter.createParcels!(
              {
                parcels: [homeParcel(country)],
                credentials,
                options: { useTestApi, country: endpointCountry, gls: service.flags },
              },
              context
            );
            const result = res.results[0];
            accepted = Boolean(result?.carrierId);
            detail = (result?.errors ?? []).map((e) => e.message).join('; ');
          } catch (error) {
            detail = error instanceof Error ? error.message : String(error);
          }

          console.log(`GLS matrix ${country} ${service.name}: ${accepted ? 'accepted' : `refused (${detail})`}`);
          if (accepted !== expected) {
            mismatches.push(
              `${country} ${service.name}: table says ${expected ? 'available' : 'unavailable'}, GLS ${accepted ? 'accepted' : `refused (${detail})`}`
            );
          }
        }
      }

      expect(mismatches).toEqual([]);
    }, 180_000);
  });
}
