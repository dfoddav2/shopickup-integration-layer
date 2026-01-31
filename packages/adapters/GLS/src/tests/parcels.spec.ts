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
} from '../mappers/parcels.js';

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

  describe('mapAddressToGLSAddress', () => {
    it('should map canonical address to GLS address format', () => {
      const result = mapAddressToGLSAddress(mockAddress);

      expect(result).toEqual({
        name: 'John Doe',
        street: 'Main Street',
        houseNumber: '123',
        city: 'Budapest',
        zipCode: '1011',
        countryIsoCode: 'HU',
        contactName: 'John',
        contactPhone: '+36 1 234 5678',
        contactEmail: 'john@example.com',
      });
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
        content: 'Package contents',
        packageType: 1,
        height: 15,
        length: 30,
        width: 20,
        weight: 2.5, // 2500 grams / 1000 = 2.5 kg
      });
    });

    it('should return undefined if no dimensions', () => {
      const parcelWithoutDimensions = {
        ...mockParcel,
        package: { weightGrams: 1000 },
      };

      const result = mapDimensionsToGLSParcelProperty(parcelWithoutDimensions as any);
      expect(result).toBeUndefined();
    });
  });

  describe('mapCanonicalParcelToGLS', () => {
    it('should map canonical parcel to GLS parcel format', () => {
      const result = mapCanonicalParcelToGLS(mockParcel as any, 12345);

      // Per GLS API spec (ver. 25.12.11), auth fields are at request root level, NOT per-parcel
      // Individual parcels contain only parcel-specific data
      expect(result.clientReference).toBe('ORDER-123');
      expect(result.count).toBe(1);
      expect(result.content).toBe('Package contents');
      expect(result.pickupAddress.name).toBe('Seller Inc');
      expect(result.deliveryAddress.name).toBe('Buyer Person');
      expect(result.codCurrency).toBe('HUF');
      expect(result.parcelPropertyList).toHaveLength(1);
    });

    it('should handle COD (cash on delivery)', () => {
      const result = mapCanonicalParcelToGLS(mockParcel as any, 12345, 5000, 'HUF');

      expect(result.codAmount).toBe(5000);
      expect(result.codCurrency).toBe('HUF');
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
    });
  });
});
