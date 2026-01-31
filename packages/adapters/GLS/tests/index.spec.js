/**
 * GLS Adapter Tests
 *
 * Tests for mapping GLS delivery points to canonical PickupPoint format
 * and basic functionality validation
 */
import { describe, it, expect } from 'vitest';
import { mapGLSDeliveryPointToPickupPoint, mapGLSDeliveryPointsToPickupPoints } from '../src/mappers/index.js';
// Test fixtures
const mockGLSDeliveryPoint = {
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
        [0, '08:00', '18:00'],
        [1, '08:00', '18:00'],
        [2, '08:00', '18:00'],
        [3, '08:00', '18:00'],
        [4, '08:00', '18:00'],
        [5, '09:00', '14:00'],
        [6, null, null],
    ],
    features: ['pickup', 'delivery', 'acceptsCash', 'acceptsCard'],
    type: 'parcel-shop',
    externalId: 'ext-1001',
    hasWheelchairAccess: true,
};
const mockGLSLocker = {
    id: '2001-LOCKER01',
    name: 'GLS ParcelLocker',
    contact: {
        countryCode: 'HU',
        postalCode: '1056',
        city: 'Budapest',
        address: 'Váci utca 62.',
    },
    location: [47.50432, 19.05874],
    hours: [[0, '07:00', '22:00']],
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
                expect(point.openingHours.Friday).toBe('09:00 - 14:00');
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
            const withPickup = {
                ...mockGLSDeliveryPoint,
                features: ['pickup'],
            };
            const point = mapGLSDeliveryPointToPickupPoint(withPickup, 'hu');
            expect(point.pickupAllowed).toBe(true);
        });
        it('should detect pickup not allowed', () => {
            const withoutPickup = {
                ...mockGLSDeliveryPoint,
                features: ['delivery'],
            };
            const point = mapGLSDeliveryPointToPickupPoint(withoutPickup, 'hu');
            expect(point.pickupAllowed).toBe(false);
        });
        it('should detect dropoff allowed', () => {
            const withDelivery = {
                ...mockGLSDeliveryPoint,
                features: ['delivery'],
            };
            const point = mapGLSDeliveryPointToPickupPoint(withDelivery, 'hu');
            expect(point.dropoffAllowed).toBe(true);
        });
        it('should detect dropoff not allowed', () => {
            const withoutDelivery = {
                ...mockGLSDeliveryPoint,
                features: ['pickup'],
            };
            const point = mapGLSDeliveryPointToPickupPoint(withoutDelivery, 'hu');
            expect(point.dropoffAllowed).toBe(false);
        });
    });
});
//# sourceMappingURL=index.spec.js.map