/**
 * MPL Adapter - Shipment Mapper Tests
 *
 * Tests for dimension-to-size mapping and size override handling.
 */

import { describe, it, expect } from 'vitest';
import { mapItem, mapDimensionsToSize } from '../../mappers/shipment.js';

describe('MPL Shipment Mapper', () => {
  describe('mapDimensionsToSize', () => {
    it('returns S for max dimension <= 38 cm', () => {
      expect(mapDimensionsToSize({ length: 30, width: 20, height: 10 })).toBe('S');
      expect(mapDimensionsToSize({ length: 38, width: 10, height: 5 })).toBe('S');
    });

    it('returns M for max dimension <= 60 cm', () => {
      expect(mapDimensionsToSize({ length: 45, width: 30, height: 20 })).toBe('M');
      expect(mapDimensionsToSize({ length: 60, width: 10, height: 5 })).toBe('M');
    });

    it('returns L for max dimension > 60 cm', () => {
      expect(mapDimensionsToSize({ length: 70, width: 40, height: 30 })).toBe('L');
      expect(mapDimensionsToSize({ length: 100, width: 50, height: 20 })).toBe('L');
    });
  });

  describe('mapItem', () => {
    it('derives size from dimensions when no override', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 1200, dimensionsCm: { length: 20, width: 15, height: 8 } },
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any);

      expect(item.size).toBe('S');
      expect(item.weight).toEqual({ value: 1200, unit: 'g' });
    });

    it('uses explicit size override when provided', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 1200, dimensionsCm: { length: 20, width: 15, height: 8 } },
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any, 'L');

      expect(item.size).toBe('L');
    });

    it('uses override even when dimensions are missing', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 }, // No dimensions
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any, 'M');

      expect(item.size).toBe('M');
    });

    it('does not set size when no dimensions and no override', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 }, // No dimensions
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any);

      expect(item.size).toBeUndefined();
    });
  });
});
