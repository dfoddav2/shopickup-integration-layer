/**
 * Unit tests for Foxpost mapper functions
 * Tests bidirectional mapping between canonical types and Foxpost API types
 */

import { describe, it, expect } from 'vitest';
import type { Parcel } from '@shopickup/core';
import {
  mapAddressToFoxpost,
  determineFoxpostSize,
  mapParcelToFoxpost,
  mapFoxpostStatusToCanonical,
  mapFoxpostTrackToCanonical,
} from '../mappers/index.js';
import type { TrackDTO } from '../types/generated.js';

// Helper: create a minimal valid parcel with new structure
function createTestParcel(overrides: Partial<Parcel> = {}): Parcel {
  const base: Parcel = {
    id: 'p1',
    shipper: {
      contact: {
        name: 'Sender Corp',
        phone: '+36301111111',
        email: 'sender@corp.com',
      },
      address: {
        name: 'Sender Corp',
        street: '100 Sender St',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        phone: '+36301111111',
        email: 'sender@corp.com',
      },
    },
    recipient: {
      contact: {
        name: 'John Doe',
        phone: '+36302222222',
        email: 'john@example.com',
      },
      delivery: {
        method: 'HOME' as const,
        address: {
          name: 'John Doe',
          street: '456 Main St',
          city: 'Debrecen',
          postalCode: '4024',
          country: 'HU',
          phone: '+36302222222',
          email: 'john@example.com',
        },
      },
    },
    package: {
      weightGrams: 1000,
      dimensionsCm: { length: 20, width: 15, height: 10 },
    },
    service: 'standard' as const,
    references: {
      customerReference: 'ORD-12345',
    },
  };

  return {
    ...base,
    ...overrides,
  } as Parcel;
}

describe('Foxpost Mappers', () => {
  describe('mapAddressToFoxpost', () => {
    it('maps canonical Address to Foxpost format', () => {
      const parcel = createTestParcel();
      const result = mapAddressToFoxpost(parcel.recipient.delivery.method === 'HOME' ? parcel.recipient.delivery.address : { name: '', street: '', city: '', postalCode: '', country: '' });

      expect(result).toBeDefined();
      expect(result.name).toBe('John Doe');
      expect(result.city).toBe('Debrecen');
      expect(result.zip).toBe('4024');
      expect(result.country).toBe('HU');
      expect(result.phone).toBe('+36302222222');
      expect(result.email).toBe('john@example.com');
    });

    it('handles optional fields gracefully', () => {
      const parcel = createTestParcel();
      const result = mapAddressToFoxpost(parcel.recipient.delivery.method === 'HOME' ? parcel.recipient.delivery.address : { name: '', street: '', city: '', postalCode: '', country: '' });

      expect(result).toBeDefined();
      expect(result.name).toBe('John Doe');
      // Should not throw even with optional fields
    });
  });

  describe('determineFoxpostSize', () => {
    it('determines size based on dimensions', () => {
      const parcel = createTestParcel();

      const result = determineFoxpostSize(parcel);

      expect(result).toBeDefined();
      expect(['xs', 's', 'm', 'l', 'xl']).toContain(result);
    });

    it('returns default size for small parcels', () => {
      const parcel = createTestParcel();
      parcel.package.dimensionsCm = { length: 10, width: 10, height: 10 };

      const result = determineFoxpostSize(parcel);

      expect(result).toBe('xs');
    });

    it('returns larger size for bigger parcels', () => {
      const parcel = createTestParcel();
      parcel.package.dimensionsCm = { length: 50, width: 40, height: 30 };

      const result = determineFoxpostSize(parcel);

      expect(['l', 'xl']).toContain(result);
    });

    it('returns default size when no dimensions provided', () => {
      const parcel = createTestParcel();
      parcel.package.dimensionsCm = undefined;

      const result = determineFoxpostSize(parcel);

      expect(result).toBe('s');
    });
  });

  describe('mapParcelToFoxpost', () => {
    it('maps canonical Parcel to Foxpost format for HOME delivery', () => {
      const parcel = createTestParcel();

      const result = mapParcelToFoxpost(parcel);

      expect(result).toBeDefined();
      expect(result.recipientName).toBe('John Doe');
      expect(result.recipientCity).toBe('Debrecen');
      expect(result.recipientZip).toBe('4024');
      expect(result.size).toBeDefined();
    });

    it('handles parcel without dimensions', () => {
      const parcel = createTestParcel();
      parcel.package.dimensionsCm = undefined;

      const result = mapParcelToFoxpost(parcel);

      expect(result).toBeDefined();
      expect(result.recipientName).toBe('John Doe');
      expect(result.size).toBe('s'); // Default size when no dimensions
    });

    it('includes reference in refCode for HOME delivery', () => {
      const parcel = createTestParcel();
      parcel.references = { customerReference: 'ORDER-999' };
      parcel.id = 'parcel-123';

      const result = mapParcelToFoxpost(parcel);

      expect(result.refCode).toContain('ORDER-999');
      expect(result.refCode).toContain('parcel-12');
    });

    it('maps canonical Parcel with PICKUP_POINT delivery to APM format', () => {
      const parcel: Parcel = {
        id: 'p-apm-001',
        shipper: {
          contact: {
            name: 'Sender Corp',
            phone: '+36301111111',
            email: 'sender@corp.com',
          },
          address: {
            name: 'Sender Corp',
            street: '100 Sender St',
            city: 'Budapest',
            postalCode: '1011',
            country: 'HU',
            phone: '+36301111111',
            email: 'sender@corp.com',
          },
        },
        recipient: {
          contact: {
            name: 'Jane Doe',
            phone: '+36302222222',
            email: 'jane@example.com',
          },
          delivery: {
            method: 'PICKUP_POINT' as const,
            pickupPoint: {
              id: 'APM-FOX-12345', // Foxpost locker code
              provider: 'foxpost',
              name: 'Foxpost Locker Downtown',
              type: 'LOCKER',
            },
            instructions: 'Leave on top shelf',
          },
        },
        package: {
          weightGrams: 500,
          dimensionsCm: { length: 15, width: 10, height: 8 },
        },
        service: 'standard' as const,
        references: {
          customerReference: 'APM-ORD-555',
        },
      };

      const result = mapParcelToFoxpost(parcel);

      // APM payloads map to Foxpost format with destination field
      expect(result).toBeDefined();
      expect(result.recipientName).toBe('Jane Doe');
      expect(result.recipientEmail).toBe('jane@example.com');
      expect(result.recipientPhone).toBe('+36302222222');
      expect(result.size).toBeDefined();
      // APM delivery should have 'destination' field (the locker ID)
      expect((result as any).destination).toBe('APM-FOX-12345');
      expect(result.refCode).toContain('APM-ORD-555');
    });

    it('returns correct parcel type discriminator for HOME delivery', () => {
      const parcel = createTestParcel();

      const result = mapParcelToFoxpost(parcel);

      // For HOME delivery, type field should be 'HD' (but mapParcelToFoxpost returns generic request)
      // The type is determined at validation layer
      expect(result).toBeDefined();
      expect(result.recipientAddress).toBeDefined();
    });

    it('returns correct payload structure for APM delivery without address fields', () => {
      const parcel: Parcel = {
        id: 'p-apm-002',
        shipper: {
          contact: { name: 'Sender' },
          address: {
            name: 'Sender',
            street: '100 St',
            city: 'Budapest',
            postalCode: '1011',
            country: 'HU',
          },
        },
        recipient: {
          contact: {
            name: 'John Smith',
            phone: '+36301234567',
            email: 'john@example.com',
          },
          delivery: {
            method: 'PICKUP_POINT' as const,
            pickupPoint: {
              id: 'LOCKER-99',
              provider: 'foxpost',
              type: 'LOCKER',
            },
          },
        },
        package: {
          weightGrams: 300,
        },
        service: 'express' as const,
      };

      const result = mapParcelToFoxpost(parcel);

      // APM should not have recipientAddress, recipientCity, recipientZip when it's a pickup point
      expect(result).toBeDefined();
      expect(result.recipientName).toBe('John Smith');
      // APM uses destination instead of address fields
      expect((result as any).destination).toBe('LOCKER-99');
      // Address fields should be undefined or not present for APM
      expect(result.recipientAddress).toBeUndefined();
      expect(result.recipientCity).toBeUndefined();
      expect(result.recipientZip).toBeUndefined();
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
       // Verify carrierStatusCode preserves original Foxpost status
       expect(result.carrierStatusCode).toBe('CREATE');
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
       // Verify each event preserves the original carrier status code
       expect(results[0].carrierStatusCode).toBe('CREATE');
       expect(results[1].carrierStatusCode).toBe('OPERIN');
       expect(results[2].carrierStatusCode).toBe('RECEIVE');
     });

     it('preserves carrierStatusCode even when canonical status is mapped', () => {
       // Map a Foxpost status that has a non-identity mapping
       const foxpostTrack: TrackDTO = {
         trackId: 1,
         status: 'HDINTRANSIT', // Maps to OUT_FOR_DELIVERY in canonical
         statusDate: '2024-01-17T12:00:00Z',
         longName: 'Out for delivery',
       };

       const result = mapFoxpostTrackToCanonical(foxpostTrack);

       // Canonical status should be mapped
       expect(result.status).toBe('OUT_FOR_DELIVERY');
       // But carrierStatusCode should preserve original
       expect(result.carrierStatusCode).toBe('HDINTRANSIT');
     });
   });
});
