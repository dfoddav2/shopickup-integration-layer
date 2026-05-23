/**
 * GLS Adapter - Parcel Creation Tests
 *
 * Tests for parcel creation mapper and validation
 */

import { describe, it, expect } from 'vitest';
import {
  mapCanonicalParcelToGLS,
  mapAddressToGLSAddress,
  mapDimensionsToGLSParcelProperty,
  extractHouseNumber,
  removeHouseNumber,
  determineContent,
  buildGLSServiceList,
} from '../../mappers/parcels.js';

describe('GLS Parcel Mapper', () => {
  const mockAddress = {
    name: 'John Doe',
    street: 'Main Street',
    houseNumber: '123',
    city: 'Budapest',
    postalCode: '1011',
    country: 'HU',
    contactName: 'John',
    contactPhone: '+36 1 234 5678',
    contactEmail: 'john@example.com',
  };

  const mockParcel = {
    id: 'ORDER-123',
    shipper: {
      contact: {
        name: 'Seller Inc',
        phone: '+36 1 111 1111',
        email: 'seller@example.com',
      },
      address: {
        street: 'Seller Street',
        houseNumber: '1',
        city: 'Budapest',
        postalCode: '1012',
        country: 'HU',
      },
    },
    recipient: {
      contact: {
        name: 'Buyer Person',
        phone: '+36 1 222 2222',
        email: 'buyer@example.com',
      },
      delivery: {
        method: 'HOME',
        address: {
          street: 'Buyer Street',
          houseNumber: '5',
          city: 'Debrecen',
          postalCode: '4025',
          country: 'HU',
        },
      },
    },
    package: {
      weightGrams: 2500,
      dimensionsCm: {
        length: 30,
        width: 20,
        height: 15,
      },
    },
    service: 'standard',
  };

  describe('extractHouseNumber', () => {
    it('should extract trailing digits from street', () => {
      expect(extractHouseNumber('Main Street 123')).toBe('123');
      expect(extractHouseNumber('Rákóczi út 42')).toBe('42');
    });

    it('should handle letters after digits', () => {
      expect(extractHouseNumber('Main St 12A')).toBe('12A');
    });

    it('should return undefined for streets without trailing numbers', () => {
      expect(extractHouseNumber('Main Street')).toBeUndefined();
      expect(extractHouseNumber('Rákóczi út')).toBeUndefined();
    });
  });

  describe('removeHouseNumber', () => {
    it('should remove trailing house number from street', () => {
      expect(removeHouseNumber('Main Street 123')).toBe('Main Street');
      expect(removeHouseNumber('Rákóczi út 42')).toBe('Rákóczi út');
    });

    it('should return original if no house number found', () => {
      expect(removeHouseNumber('Main Street')).toBe('Main Street');
    });
  });

  describe('determineContent', () => {
    it('should use explicit override if provided', () => {
      const result = determineContent(mockParcel as any, 'Custom contents');
      expect(result).toBe('Custom contents');
    });

    it('should use metadata glsContent if available', () => {
      const parcel = {
        ...mockParcel,
        metadata: { glsContent: 'Books and electronics' },
      };
      expect(determineContent(parcel as any)).toBe('Books and electronics');
    });

    it('should use first item description if no metadata', () => {
      const parcel = {
        ...mockParcel,
        items: [
          { sku: 'SKU-1', quantity: 1, description: 'Blue widget' },
          { sku: 'SKU-2', quantity: 2, description: 'Red widget' },
        ],
      };
      expect(determineContent(parcel as any)).toBe('Blue widget, Red widget');
    });

    it('should return undefined if no content sources available', () => {
      expect(determineContent(mockParcel as any)).toBeUndefined();
    });
  });

  describe('mapAddressToGLSAddress', () => {
    it('should map canonical address to GLS address format', () => {
      const result = mapAddressToGLSAddress(mockAddress);

      expect(result).toEqual({
        name: 'John Doe',
        street: 'Main Street',
        houseNumber: '123',
        houseNumberInfo: '',
        city: 'Budapest',
        zipCode: '1011',
        countryIsoCode: 'HU',
        contactName: 'John',
        contactPhone: '+36 1 234 5678',
        contactEmail: 'john@example.com',
      });
    });

    it('should extract house number from street when not explicitly provided', () => {
      const address = {
        name: 'John',
        street: 'Main Street 456',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
      };

      const result = mapAddressToGLSAddress(address);
      expect(result.street).toBe('Main Street');
      expect(result.houseNumber).toBe('456');
    });

    it('should use houseNumberInfo from building field', () => {
      const address = {
        name: 'John',
        street: 'Main St',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        building: 'Floor 3',
      };

      const result = mapAddressToGLSAddress(address);
      expect(result.houseNumberInfo).toBe('Floor 3');
    });

    it('should handle missing optional fields', () => {
      const minimalAddress = {
        name: 'John',
        street: 'Main St',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
      };

      const result = mapAddressToGLSAddress(minimalAddress);
      expect(result.name).toBe('John');
      expect(result.street).toBe('Main St');
      expect(result.city).toBe('Budapest');
      expect(result.zipCode).toBe('1011');
      expect(result.countryIsoCode).toBe('HU');
      expect(result.contactName).toBeUndefined();
      expect(result.contactPhone).toBeUndefined();
    });

    it('should handle lowercase country codes', () => {
      const addressWithLowercase = {
        ...mockAddress,
        country: 'hu',
      };

      const result = mapAddressToGLSAddress(addressWithLowercase);
      expect(result.countryIsoCode).toBe('HU');
    });
  });

  describe('mapDimensionsToGLSParcelProperty', () => {
    it('should map parcel dimensions to GLS format', () => {
      const result = mapDimensionsToGLSParcelProperty(mockParcel as any);

      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        content: undefined,
        packageType: 1,
        height: 15,
        length: 30,
        width: 20,
        weight: 2.5, // 2500 grams / 1000 = 2.5 kg
      });
    });

    it('should use content from determineContent', () => {
      const parcel = {
        ...mockParcel,
        metadata: { glsContent: 'Books' },
      };
      const result = mapDimensionsToGLSParcelProperty(parcel as any);
      expect(result![0].content).toBe('Books');
    });

    it('should return undefined if no dimensions', () => {
      const parcelWithoutDimensions = {
        ...mockParcel,
        package: { weightGrams: 1000 },
      };

      const result = mapDimensionsToGLSParcelProperty(parcelWithoutDimensions as any);
      expect(result).toBeUndefined();
    });

    it('should use packageType override when provided', () => {
      const result = mapDimensionsToGLSParcelProperty(mockParcel as any, { packageType: 5 });

      expect(result).toHaveLength(1);
      expect(result![0].packageType).toBe(5); // Case
    });

    it('should default packageType to 1 (Colli) when no override', () => {
      const result = mapDimensionsToGLSParcelProperty(mockParcel as any);

      expect(result).toHaveLength(1);
      expect(result![0].packageType).toBe(1);
    });
  });

  describe('buildGLSServiceList', () => {
    it('should include PSD for pickup point delivery', () => {
      const parcel = {
        ...mockParcel,
        recipient: {
          contact: mockParcel.recipient.contact,
          delivery: {
            method: 'PICKUP_POINT',
            pickupPoint: {
              id: '379-PARCELSHOP',
              name: 'GLS ParcelShop',
            },
          },
        },
      };

      const services = buildGLSServiceList(parcel as any);
      const psd = services.find((s) => s.code === 'PSD');
      expect(psd).toBeDefined();
      expect(psd!.value).toBe('379-PARCELSHOP');
    });

    it('should include SAT when saturdayDelivery is enabled', () => {
      const services = buildGLSServiceList(mockParcel as any, { saturdayDelivery: true });
      expect(services.some((s) => s.code === 'SAT')).toBe(true);
    });

    it('should include T09/T10/T12 for express service', () => {
      const parcel = { ...mockParcel, service: 'express' };
      const services = buildGLSServiceList(parcel as any);
      expect(services.some((s) => s.code === 'T09')).toBe(true);
      expect(services.some((s) => s.code === 'T10')).toBe(true);
      expect(services.some((s) => s.code === 'T12')).toBe(true);
    });

    it('should include T09/T10/T12 for overnight service', () => {
      const parcel = { ...mockParcel, service: 'overnight' };
      const services = buildGLSServiceList(parcel as any);
      expect(services.some((s) => s.code === 'T09')).toBe(true);
      expect(services.some((s) => s.code === 'T10')).toBe(true);
      expect(services.some((s) => s.code === 'T12')).toBe(true);
    });

    it('should not include express services for standard', () => {
      const services = buildGLSServiceList(mockParcel as any);
      expect(services.some((s) => s.code === 'T09')).toBe(false);
    });

    it('should include INS when insurance is present', () => {
      const parcel = {
        ...mockParcel,
        insurance: {
          amount: { amount: 10000, currency: 'HUF' },
        },
      };

      const services = buildGLSServiceList(parcel as any);
      const ins = services.find((s) => s.code === 'INS');
      expect(ins).toBeDefined();
      expect(ins!.insParameter).toEqual({ value: 10000 });
    });

    it('should include DPV when declaredValue is present', () => {
      const parcel = {
        ...mockParcel,
        declaredValue: {
          amount: 50000,
          currency: 'HUF',
        },
      };

      const services = buildGLSServiceList(parcel as any);
      const dpv = services.find((s) => s.code === 'DPV');
      expect(dpv).toBeDefined();
      expect(dpv!.dpvParameter).toEqual({ stringValue: 'HUF', decimalValue: 50000 });
    });

    it('should include FDS when recipient has email', () => {
      const services = buildGLSServiceList(mockParcel as any);
      const fds = services.find((s) => s.code === 'FDS');
      expect(fds).toBeDefined();
      expect(fds!.fdsParameter).toEqual({ value: 'buyer@example.com' });
    });

    it('should include FSS when recipient has phone', () => {
      const services = buildGLSServiceList(mockParcel as any);
      const fss = services.find((s) => s.code === 'FSS');
      expect(fss).toBeDefined();
      expect(fss!.fssParameter).toEqual({ value: '+36 1 222 2222' });
    });

    it('should merge explicit services', () => {
      const services = buildGLSServiceList(mockParcel as any, {
        services: [
          { code: '24H' },
          { code: 'AOS', aosParameter: { value: 'Neighbor' } },
        ],
      });
      expect(services.some((s) => s.code === '24H')).toBe(true);
      expect(services.some((s) => s.code === 'AOS')).toBe(true);
    });

    it('should allow explicit services to override auto-derived ones', () => {
      const parcel = {
        ...mockParcel,
        insurance: {
          amount: { amount: 10000, currency: 'HUF' },
        },
      };

      const services = buildGLSServiceList(parcel as any, {
        services: [
          { code: 'INS', insParameter: { value: 50000 } },
        ],
      });

      const ins = services.find((s) => s.code === 'INS');
      expect(ins!.insParameter).toEqual({ value: 50000 }); // explicit overrides auto
    });

    it('should return empty array when no services apply', () => {
      const parcel = {
        ...mockParcel,
        recipient: {
          contact: { name: 'Test' }, // no phone, no email
          delivery: {
            method: 'HOME',
            address: { street: 'St', city: 'City', postalCode: '1234', country: 'HU' },
          },
        },
      };

      const services = buildGLSServiceList(parcel as any);
      expect(services).toHaveLength(0);
    });
  });

  describe('mapCanonicalParcelToGLS', () => {
    it('should map canonical parcel to GLS parcel format', () => {
      const result = mapCanonicalParcelToGLS(mockParcel as any, 12345);

      // Per GLS API spec (ver. 25.12.11), auth fields are at request root level, NOT per-parcel
      // Individual parcels contain only parcel-specific data
      expect(result.clientReference).toBe('ORDER-123');
      expect(result.count).toBe(1);
      expect(result.pickupAddress.name).toBe('Seller Inc');
      expect(result.deliveryAddress.name).toBe('Buyer Person');
      expect(result.parcelPropertyList).toHaveLength(1);
      expect(result.codAmount).toBeUndefined();
      expect(result.codCurrency).toBeUndefined();
    });

    it('should map COD from parcel.cod', () => {
      const parcel = {
        ...mockParcel,
        cod: {
          amount: { amount: 5000, currency: 'HUF' },
          reference: 'COD-REF-001',
        },
      };

      const result = mapCanonicalParcelToGLS(parcel as any, 12345);
      expect(result.codAmount).toBe(5000);
      expect(result.codCurrency).toBe('HUF');
      expect(result.codReference).toBe('COD-REF-001');
    });

    it('should map options fields', () => {
      const result = mapCanonicalParcelToGLS(mockParcel as any, 12345, {
        pickupDate: '2026-05-25T10:00:00Z',
        saturdayDelivery: true,
        senderIdentityCardNumber: '123456789',
        pickupType: 2,
        content: 'Electronics',
      });

      expect(result.pickupDate).toBe('2026-05-25T10:00:00Z');
      expect(result.senderIdentityCardNumber).toBe('123456789');
      expect(result.pickupType).toBe(2);
      expect(result.content).toBe('Electronics');
      expect(result.serviceList?.some((s) => s.code === 'SAT')).toBe(true);
    });

    it('should handle pickup point delivery', () => {
      const parcelWithPickupPoint = {
        ...mockParcel,
        recipient: {
          contact: mockParcel.recipient.contact,
          delivery: {
            method: 'PICKUP_POINT',
            pickupPoint: {
              id: 'GLS-001',
              name: 'GLS ParcelShop Central',
              address: {
                street: 'Pickup Street',
                city: 'Budapest',
                postalCode: '1011',
                country: 'HU',
              },
            },
          },
        },
      };

      const result = mapCanonicalParcelToGLS(parcelWithPickupPoint as any, 12345);

      expect(result.deliveryAddress.name).toBe('GLS ParcelShop Central');
      expect(result.deliveryAddress.street).toBe('Pickup Street');
      expect(result.serviceList?.some((s) => s.code === 'PSD')).toBe(true);
    });

    it('should map house number extraction for delivery address', () => {
      const parcel = {
        ...mockParcel,
        recipient: {
          contact: mockParcel.recipient.contact,
          delivery: {
            method: 'HOME',
            address: {
              street: 'Kossuth Lajos utca 15',
              city: 'Budapest',
              postalCode: '1053',
              country: 'HU',
            },
          },
        },
      };

      const result = mapCanonicalParcelToGLS(parcel as any, 12345);
      expect(result.deliveryAddress.street).toBe('Kossuth Lajos utca');
      expect(result.deliveryAddress.houseNumber).toBe('15');
    });

    it('should map content from metadata', () => {
      const parcel = {
        ...mockParcel,
        metadata: { glsContent: 'Vintage records' },
      };

      const result = mapCanonicalParcelToGLS(parcel as any, 12345);
      expect(result.content).toBe('Vintage records');
    });

    it('should map content from items', () => {
      const parcel = {
        ...mockParcel,
        items: [
          { sku: 'SKU-1', quantity: 1, description: 'Blue widget' },
          { sku: 'SKU-2', quantity: 2, description: 'Red widget' },
        ],
      };

      const result = mapCanonicalParcelToGLS(parcel as any, 12345);
      expect(result.content).toBe('Blue widget, Red widget');
    });
  });
});
