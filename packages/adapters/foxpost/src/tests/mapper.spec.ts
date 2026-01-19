/**
 * Unit tests for Foxpost mapper functions
 * Tests bidirectional mapping between canonical types and Foxpost API types
 */

import { describe, it, expect } from 'vitest';
import type { Shipment, Parcel, Address } from '@shopickup/core';
import {
  mapAddressToFoxpost,
  determineFoxpostSize,
  mapParcelToFoxpost,
  mapFoxpostStatusToCanonical,
  mapFoxpostTrackToCanonical,
} from '../mappers/index.js';
import type { TrackDTO } from '../types/generated.js';

describe('Foxpost Mappers', () => {
  describe('mapAddressToFoxpost', () => {
    it('maps canonical Address to Foxpost format', () => {
      const canonical: Address = {
        name: 'John Doe',
        street: '123 Main St',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        phone: '+36301234567',
        email: 'john@example.com',
      };

      const result = mapAddressToFoxpost(canonical);

      expect(result).toBeDefined();
      expect(result.name).toBe('John Doe');
      expect(result.city).toBe('Budapest');
      expect(result.zip).toBe('1011');
      expect(result.country).toBe('HU');
      expect(result.phone).toBe('+36301234567');
      expect(result.email).toBe('john@example.com');
    });

    it('handles optional fields gracefully', () => {
      const minimal: Address = {
        name: 'Jane Doe',
        street: '456 Oak Ave',
        city: 'Debrecen',
        postalCode: '4024',
        country: 'HU',
      };

      const result = mapAddressToFoxpost(minimal);

      expect(result).toBeDefined();
      expect(result.name).toBe('Jane Doe');
      expect(result.phone).toBe('');
      expect(result.email).toBe('');
      // Should not throw even with missing optional fields
    });
  });

  describe('determineFoxpostSize', () => {
    it('determines size based on dimensions', () => {
      const parcel: Parcel = {
        id: 'p1',
        shipmentId: 's1',
        weight: 1000,
        dimensions: { length: 20, width: 15, height: 10 },
        status: 'draft',
      };

      const result = determineFoxpostSize(parcel);

      expect(result).toBeDefined();
      expect(['xs', 's', 'm', 'l', 'xl']).toContain(result);
    });

    it('returns default size for small parcels', () => {
      const parcel: Parcel = {
        id: 'p2',
        shipmentId: 's2',
        weight: 100,
        dimensions: { length: 10, width: 10, height: 10 },
        status: 'draft',
      };

      const result = determineFoxpostSize(parcel);

      expect(result).toBe('xs');
    });

    it('returns larger size for bigger parcels', () => {
      const parcel: Parcel = {
        id: 'p3',
        shipmentId: 's3',
        weight: 5000,
        dimensions: { length: 50, width: 40, height: 30 },
        status: 'draft',
      };

      const result = determineFoxpostSize(parcel);

      expect(['l', 'xl']).toContain(result);
    });

    it('returns default size when no dimensions provided', () => {
      const parcel: Parcel = {
        id: 'p4',
        shipmentId: 's4',
        weight: 500,
        status: 'draft',
      };

      const result = determineFoxpostSize(parcel);

      expect(result).toBe('s');
    });
  });

  describe('mapParcelToFoxpost', () => {
    it('maps canonical Parcel to Foxpost format', () => {
      const shipment: Shipment = {
        id: 's1',
        sender: {
          name: 'Sender Corp',
          street: '100 Sender St',
          city: 'Budapest',
          postalCode: '1011',
          country: 'HU',
          phone: '+36301111111',
          email: 'sender@corp.com',
        },
        recipient: {
          name: 'John Doe',
          street: '456 Main St',
          city: 'Debrecen',
          postalCode: '4024',
          country: 'HU',
          phone: '+36302222222',
          email: 'john@example.com',
        },
        service: 'standard',
        totalWeight: 1000,
        reference: 'ORD-12345',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const parcel: Parcel = {
        id: 'p1',
        shipmentId: 's1',
        weight: 1000,
        dimensions: { length: 20, width: 15, height: 10 },
        status: 'draft',
      };

      const result = mapParcelToFoxpost(parcel, shipment);

      expect(result).toBeDefined();
      expect(result.recipientName).toBe('John Doe');
      expect(result.recipientCity).toBe('Debrecen');
      expect(result.recipientZip).toBe('4024');
      expect(result.size).toBeDefined();
    });

    it('handles parcel without dimensions', () => {
      const shipment: Shipment = {
        id: 's2',
        sender: {
          name: 'Sender',
          street: 'St',
          city: 'Budapest',
          postalCode: '1011',
          country: 'HU',
        },
        recipient: {
          name: 'Recipient',
          street: 'Street',
          city: 'Debrecen',
          postalCode: '4024',
          country: 'HU',
        },
        service: 'standard',
        totalWeight: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const parcel: Parcel = {
        id: 'p2',
        shipmentId: 's2',
        weight: 500,
        status: 'draft',
      };

      const result = mapParcelToFoxpost(parcel, shipment);

      expect(result).toBeDefined();
      expect(result.recipientName).toBe('Recipient');
      expect(result.size).toBe('s'); // Default size when no dimensions
    });
  });

  describe('mapFoxpostStatusToCanonical', () => {
    it('maps Foxpost status CREATE to PENDING', () => {
      const result = mapFoxpostStatusToCanonical('CREATE');
      expect(result).toBe('PENDING');
    });

    it('maps Foxpost status OPERIN to IN_TRANSIT', () => {
      const result = mapFoxpostStatusToCanonical('OPERIN');
      expect(result).toBe('IN_TRANSIT');
    });

    it('maps Foxpost status RECEIVE to DELIVERED', () => {
      const result = mapFoxpostStatusToCanonical('RECEIVE');
      expect(result).toBe('DELIVERED');
    });

    it('handles unknown status gracefully', () => {
      const result = mapFoxpostStatusToCanonical('UNKNOWN_STATUS');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('mapFoxpostTrackToCanonical', () => {
    it('maps Foxpost track to canonical TrackingEvent', () => {
      const foxpostTrack: TrackDTO = {
        trackId: 1,
        status: 'CREATE',
        statusDate: '2024-01-17T10:00:00Z',
        longName: 'Parcel created',
      };

      const result = mapFoxpostTrackToCanonical(foxpostTrack);

      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING');
      expect(result.description).toBe('Parcel created');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('handles multiple status transitions', () => {
      const tracks: TrackDTO[] = [
        {
          trackId: 1,
          status: 'CREATE',
          statusDate: '2024-01-17T10:00:00Z',
          longName: 'Parcel created',
        },
        {
          trackId: 2,
          status: 'OPERIN',
          statusDate: '2024-01-17T15:00:00Z',
          longName: 'In transit',
        },
        {
          trackId: 3,
          status: 'RECEIVE',
          statusDate: '2024-01-18T10:00:00Z',
          longName: 'Delivered',
        },
      ];

      const results = tracks.map(t => mapFoxpostTrackToCanonical(t));

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('PENDING');
      expect(results[1].status).toBe('IN_TRANSIT');
      expect(results[2].status).toBe('DELIVERED');
    });
  });
});
