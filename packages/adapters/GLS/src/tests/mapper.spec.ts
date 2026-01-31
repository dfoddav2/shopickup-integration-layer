/**
 * GLS Adapter Tests
 * 
 * Tests for mapping GLS delivery points to canonical PickupPoint format
 * and basic functionality validation
 */

import { describe, it, expect } from 'vitest';
import { mapGLSDeliveryPointToPickupPoint, mapGLSDeliveryPointsToPickupPoints } from '../mappers/index.js';
import type { GLSDeliveryPoint } from '../types/index.js';

// Test fixtures
const mockGLSDeliveryPoint: GLSDeliveryPoint = {
   id: '1001-SHOP01',
   goldId: 1001,
   name: 'GLS ParcelShop Budapest',
   description: 'Central Budapest location',
   contact: {
     countryCode: 'HU',
     postalCode: '1011',
     city: 'Budapest',
     address: 'Akadémia utca 3.',
     phone: '+36123456789',
     web: 'https://www.gls-hungary.com',
   },
   location: [47.50295, 19.03343],
   hours: [
     [1, '08:00', '18:00'],  // Monday
     [2, '08:00', '18:00'],  // Tuesday
     [3, '08:00', '18:00'],  // Wednesday
     [4, '08:00', '18:00'],  // Thursday
     [5, '08:00', '18:00'],  // Friday
     [6, '09:00', '14:00'],  // Saturday
     [7, null as any, null as any],  // Sunday (closed)
   ] as any,
   features: ['pickup', 'delivery', 'acceptsCash', 'acceptsCard'],
   type: 'parcel-shop',
   externalId: 'ext-1001',
   hasWheelchairAccess: true,
 };

const mockGLSLocker: GLSDeliveryPoint = {
   id: '2001-LOCKER01',
   name: 'GLS ParcelLocker',
   contact: {
     countryCode: 'HU',
     postalCode: '1056',
     city: 'Budapest',
     address: 'Váci utca 62.',
   },
   location: [47.50432, 19.05874],
   hours: [[1, '07:00', '22:00']],  // Monday
   features: ['pickup', 'delivery'],
   type: 'parcel-locker',
   hasWheelchairAccess: false,
 };

const mockGLSLockerClosed: GLSDeliveryPoint = {
  id: '3001-LOCKER02',
  name: 'GLS ParcelLocker 24/7 (24-hour)',
  contact: {
    countryCode: 'HU',
    postalCode: '1011',
    city: 'Budapest',
    address: 'Kossuth Lajos tér 11.',
  },
  location: [47.50720, 19.04556],
  hours: [
    [1, null, null],
    [2, null, null],
    [3, null, null],
    [4, null, null],
    [5, null, null],
    [6, null, null],
    [7, null, null],
  ],
  features: ['pickup', 'delivery'],
  type: 'parcel-locker',
  hasWheelchairAccess: false,
};

describe('GLS Adapter - Mapper', () => {
  describe('mapGLSDeliveryPointToPickupPoint', () => {
    it('should map parcel shop correctly', () => {
      const point = mapGLSDeliveryPointToPickupPoint(mockGLSDeliveryPoint, 'hu');

      expect(point.id).toBe('1001-SHOP01');
      expect(point.name).toBe('GLS ParcelShop Budapest');
      expect(point.country).toBe('hu');
      expect(point.postalCode).toBe('1011');
      expect(point.city).toBe('Budapest');
      expect(point.latitude).toBe(47.50295);
      expect(point.longitude).toBe(19.03343);
      expect(point.address).toContain('Akadémia utca 3.');
      expect(point.pickupAllowed).toBe(true);
      expect(point.dropoffAllowed).toBe(true);
      expect(point.isOutdoor).toBe(false);
      expect(point.paymentOptions).toContain('cash');
      expect(point.paymentOptions).toContain('card');
    });

    it('should detect parcel lockers', () => {
      const point = mapGLSDeliveryPointToPickupPoint(mockGLSLocker, 'hu');

      expect(point.isOutdoor).toBe(true); // Lockers are outdoor
      expect(point.id).toBe('2001-LOCKER01');
    });

    it('should normalize country code to lowercase', () => {
      const point1 = mapGLSDeliveryPointToPickupPoint(mockGLSDeliveryPoint, 'HU');
      const point2 = mapGLSDeliveryPointToPickupPoint(mockGLSDeliveryPoint, 'hu');

      expect(point1.country).toBe('hu');
      expect(point2.country).toBe('hu');
    });

    it('should handle missing contact phone gracefully', () => {
      const point = mapGLSDeliveryPointToPickupPoint(mockGLSLocker, 'hu');

      // Contact should be undefined if no phone
      expect(point.contact).toBeUndefined();
    });

     it('should parse opening hours correctly', () => {
       const point = mapGLSDeliveryPointToPickupPoint(mockGLSDeliveryPoint, 'hu');

       if (point.openingHours && typeof point.openingHours === 'object') {
         expect(point.openingHours.Monday).toBe('08:00 - 18:00');
         expect(point.openingHours.Friday).toBe('08:00 - 18:00');
         expect(point.openingHours.Saturday).toBe('09:00 - 14:00');
         // Sunday is null, so should not be present
         expect((point.openingHours as Record<string, string>).Sunday).toBeUndefined();
       }
     });

     it('should skip null hours entries and return valid hours only', () => {
       const point = mapGLSDeliveryPointToPickupPoint(mockGLSDeliveryPoint, 'hu');

       // Sunday (index 7) has null hours and should be excluded
       expect(point.openingHours).toBeDefined();
       if (point.openingHours && typeof point.openingHours === 'object') {
         expect((point.openingHours as Record<string, string>).Sunday).toBeUndefined();
         // Monday-Saturday should be present (6 days)
         expect(Object.keys(point.openingHours).length).toBe(6);
       }
     });

     it('should return undefined for locations with only null hours (24/7 lockers)', () => {
       const point = mapGLSDeliveryPointToPickupPoint(mockGLSLockerClosed, 'hu');

       // All hours are null, so openingHours should be undefined
       expect(point.openingHours).toBeUndefined();
     });

     it('should handle lunch break tuples (4+ elements)', () => {
       const withLunchBreak: GLSDeliveryPoint = {
         ...mockGLSDeliveryPoint,
         hours: [
           [1, '09:00', '18:00', '12:00', '12:30'], // Monday with lunch break
           [2, '09:00', '18:00', '12:00', '12:30'],
         ] as any,
       };

       const point = mapGLSDeliveryPointToPickupPoint(withLunchBreak, 'hu');

       // Should extract primary hours, ignoring lunch break times
       expect(point.openingHours).toBeDefined();
       if (point.openingHours && typeof point.openingHours === 'object') {
         expect((point.openingHours as Record<string, string>).Monday).toBe('09:00 - 18:00');
         expect((point.openingHours as Record<string, string>).Tuesday).toBe('09:00 - 18:00');
       }
     });

    it('should preserve raw data', () => {
      const point = mapGLSDeliveryPointToPickupPoint(mockGLSDeliveryPoint, 'hu');

      expect(point.raw).toEqual(mockGLSDeliveryPoint);
    });

    it('should set provider ID from external ID', () => {
      const point = mapGLSDeliveryPointToPickupPoint(mockGLSDeliveryPoint, 'hu');

      expect(point.providerId).toBe('ext-1001');
    });

    it('should include wheelchair access in metadata', () => {
      const point = mapGLSDeliveryPointToPickupPoint(mockGLSDeliveryPoint, 'hu');

      expect(point.metadata?.hasWheelchairAccess).toBe(true);
    });
  });

  describe('mapGLSDeliveryPointsToPickupPoints', () => {
    it('should map array of delivery points', () => {
      const points = mapGLSDeliveryPointsToPickupPoints([mockGLSDeliveryPoint, mockGLSLocker], 'hu');

      expect(points).toHaveLength(2);
      expect(points[0].id).toBe('1001-SHOP01');
      expect(points[1].id).toBe('2001-LOCKER01');
    });

    it('should handle empty array', () => {
      const points = mapGLSDeliveryPointsToPickupPoints([], 'hu');

      expect(points).toHaveLength(0);
    });
  });

  describe('Feature detection', () => {
    it('should detect pickup allowed', () => {
      const withPickup: GLSDeliveryPoint = {
        ...mockGLSDeliveryPoint,
        features: ['pickup'],
      };

      const point = mapGLSDeliveryPointToPickupPoint(withPickup, 'hu');
      expect(point.pickupAllowed).toBe(true);
    });

    it('should detect pickup not allowed', () => {
      const withoutPickup: GLSDeliveryPoint = {
        ...mockGLSDeliveryPoint,
        features: ['delivery'],
      };

      const point = mapGLSDeliveryPointToPickupPoint(withoutPickup, 'hu');
      expect(point.pickupAllowed).toBe(false);
    });

    it('should detect dropoff allowed', () => {
      const withDelivery: GLSDeliveryPoint = {
        ...mockGLSDeliveryPoint,
        features: ['delivery'],
      };

      const point = mapGLSDeliveryPointToPickupPoint(withDelivery, 'hu');
      expect(point.dropoffAllowed).toBe(true);
    });

    it('should detect dropoff not allowed', () => {
      const withoutDelivery: GLSDeliveryPoint = {
        ...mockGLSDeliveryPoint,
        features: ['pickup'],
      };

      const point = mapGLSDeliveryPointToPickupPoint(withoutDelivery, 'hu');
      expect(point.dropoffAllowed).toBe(false);
    });
  });
});
