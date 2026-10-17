/**
 * GLS Adapter - Supported Countries Tests
 *
 * Covers the shipping-country list (MyGLS endpoints) and the wider
 * pickup-point feed list, including mapping parcels for every non-HU market.
 */

import { describe, it, expect } from 'vitest';
import { GLSAdapter } from '../../index.js';
import {
  GLS_SUPPORTED_COUNTRIES,
  GLS_PICKUP_POINT_COUNTRIES,
} from '../../constants.js';
import { resolveGLSBaseUrl, resolveGLSEndpointCountry } from '../../utils/authentication.js';
import {
  mapCanonicalParcelToGLS,
  buildGLSServiceList,
  resolveDestinationCountry,
} from '../../mappers/parcels.js';

const INTERNATIONAL = ['CZ', 'HR', 'RO', 'SI', 'SK', 'RS'] as const;
// A valid mobile number per destination: GLS refuses anything else for PSD, SM2 and FSS (see phone.ts).
const MOBILE: Record<string, string> = {
  HU: '+36 30 123 4567', CZ: '+420 601 123 456', HR: '+385 92 123 4567', RO: '+40 712 034 567',
  SI: '+386 31 234 567', SK: '+421 912 123 456', RS: '+381 60 1234567',
};

function parcelTo(country: string) {
  return {
    id: `ORDER-${country}`,
    shipper: {
      contact: { name: 'Seller Inc', phone: '+36 1 111 1111', email: 'seller@example.com' },
      address: { street: 'Seller Street', houseNumber: '1', city: 'Budapest', postalCode: '1012', country: 'HU' },
    },
    recipient: {
      contact: { name: 'Buyer Person', phone: MOBILE[country], email: 'buyer@example.com' },
      delivery: {
        method: 'HOME',
        address: { street: 'Buyer Street', houseNumber: '5', city: 'Somewhere', postalCode: '1000', country },
      },
    },
    package: { weightGrams: 2500, dimensionsCm: { length: 30, width: 20, height: 15 } },
    service: 'standard',
  };
}

describe('GLS supported countries', () => {
  it('declares HU plus the six international MyGLS markets on the adapter', () => {
    expect([...new GLSAdapter().supportedCountries].sort()).toEqual(['HU', ...INTERNATIONAL].sort());
    expect(GLS_SUPPORTED_COUNTRIES).toHaveLength(7);
  });

  it('keeps the pickup point list a superset of the shipping list', () => {
    for (const c of GLS_SUPPORTED_COUNTRIES) {
      expect(GLS_PICKUP_POINT_COUNTRIES).toContain(c);
    }
    expect(GLS_PICKUP_POINT_COUNTRIES).toContain('AT');
  });

  it.each(GLS_SUPPORTED_COUNTRIES)('resolves production and test base URLs for %s', (cc) => {
    const lower = cc.toLowerCase();
    expect(resolveGLSBaseUrl(cc)).toBe(`https://api.mygls.${lower}/ParcelService.svc`);
    expect(resolveGLSBaseUrl(lower, true)).toBe(`https://api.test.mygls.${lower}/ParcelService.svc`);
  });

  it.each(['AT', 'DE', 'PL', 'UA'])('rejects %s (pickup feed only or unsupported)', (cc) => {
    expect(() => resolveGLSBaseUrl(cc)).toThrow(/Unsupported country/);
  });

  it.each(INTERNATIONAL)('maps a home delivery parcel to %s', (cc) => {
    const result = mapCanonicalParcelToGLS(parcelTo(cc) as any, 12345);
    expect(result.deliveryAddress.countryIsoCode).toBe(cc);
    expect(result.pickupAddress.countryIsoCode).toBe('HU');
  });

  it.each(INTERNATIONAL)('accepts a matching %s phone prefix for SMS pre-advice', (cc) => {
    const result = mapCanonicalParcelToGLS(parcelTo(cc) as any, 12345, { smsPreadviceSM2: true } as any);
    expect(result.serviceList?.some((s: any) => s.code === 'SM2')).toBe(true);
  });

  it.each(INTERNATIONAL)('rejects a mismatched phone prefix for %s SMS pre-advice', (cc) => {
    const parcel = parcelTo(cc);
    parcel.recipient.contact.phone = '+36 30 123 4567';
    expect(() =>
      mapCanonicalParcelToGLS(parcel as any, 12345, { smsPreadviceSM2: true } as any),
    ).toThrow(/does not match destination country/);
  });

  describe('endpoint country resolution', () => {
    it('prefers options.gls.country, then options.country, then shipper, then HU', () => {
      expect(resolveGLSEndpointCountry({ gls: { country: 'sk' }, country: 'CZ' }, 'RO')).toBe('SK');
      expect(resolveGLSEndpointCountry({ country: 'cz' }, 'RO')).toBe('CZ');
      expect(resolveGLSEndpointCountry({}, 'ro')).toBe('RO');
      expect(resolveGLSEndpointCountry(undefined, undefined)).toBe('HU');
    });
  });

  describe('destination validation', () => {
    it.each(['AT', 'DE', 'UA'])('rejects destination %s', (cc) => {
      const parcel = parcelTo('CZ');
      (parcel.recipient.delivery as any).address.country = cc;
      expect(() => mapCanonicalParcelToGLS(parcel as any, 12345)).toThrow(/does not support shipping to/);
    });

    it('uses the pickup point address country for pickup point deliveries', () => {
      const parcel: any = parcelTo('SK');
      parcel.recipient.delivery = {
        method: 'PICKUP_POINT',
        pickupPoint: {
          id: 'SK-123',
          name: 'Pickup',
          address: { name: 'Pickup', street: 'Main 1', city: 'Bratislava', postalCode: '81101', country: 'SK' },
        },
      };
      expect(resolveDestinationCountry(parcel)).toBe('SK');
      const result = mapCanonicalParcelToGLS(parcel, 12345);
      expect(result.deliveryAddress.countryIsoCode).toBe('SK');
      expect(result.deliveryAddress.city).toBe('Bratislava');
    });
  });

  describe('Serbia sender requirements', () => {
    const rsSender = () => {
      const parcel: any = parcelTo('HU');
      parcel.shipper.address.country = 'RS';
      parcel.recipient.delivery.address.country = 'HU';
      parcel.recipient.contact.phone = '+36 30 123 4567';
      return parcel;
    };

    it('requires senderIdentityCardNumber and content for RS senders', () => {
      expect(() => mapCanonicalParcelToGLS(rsSender(), 1, { content: 'Books' })).toThrow(/senderIdentityCardNumber/);
      expect(() => mapCanonicalParcelToGLS(rsSender(), 1, { senderIdentityCardNumber: '123' })).toThrow(/content/);
      const ok = mapCanonicalParcelToGLS(rsSender(), 1, { senderIdentityCardNumber: '123', content: 'Books' });
      expect(ok.senderIdentityCardNumber).toBe('123');
    });

    it('does not require them for HU senders shipping to RS', () => {
      const result = mapCanonicalParcelToGLS(parcelTo('RS') as any, 1);
      expect(result.deliveryAddress.countryIsoCode).toBe('RS');
    });
  });

  describe('service rules', () => {
    it('throws for SRS outside HU and SI', () => {
      expect(() => buildGLSServiceList(parcelTo('CZ') as any, { shopReturnServiceSRS: true })).toThrow(/SRS/);
      expect(buildGLSServiceList(parcelTo('SI') as any, { shopReturnServiceSRS: true }).map((s) => s.code)).toContain('SRS');
    });

    it('requires a DPV currency for non-HU destinations', () => {
      const parcel: any = parcelTo('HR');
      parcel.declaredValue = { amount: 100 };
      expect(() => buildGLSServiceList(parcel)).toThrow(/currency is required/);
      parcel.declaredValue = { amount: 100, currency: 'EUR' };
      expect(buildGLSServiceList(parcel).find((s) => s.code === 'DPV')?.dpvParameter?.stringValue).toBe('EUR');
      const hu: any = parcelTo('HU');
      hu.declaredValue = { amount: 100 };
      expect(buildGLSServiceList(hu).find((s) => s.code === 'DPV')?.dpvParameter?.stringValue).toBe('HUF');
    });
  });
});
