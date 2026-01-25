/**
 * Tests for Foxpost APM/Pickup-Points Zod Validation Schemas
 */

import { describe, it, expect } from 'vitest';
import {
  safeValidateFoxpostApmEntry,
  safeValidateFoxpostApmFeed,
  type FoxpostApmEntry,
} from '../validation.js';

describe('Foxpost APM Zod Validation', () => {
  describe('safeValidateFoxpostApmEntry', () => {
    it('should validate a complete valid APM entry', () => {
      const validEntry = {
        place_id: 'APM001',
        operator_id: 'OP001',
        name: 'Foxpost APM #1',
        ssapt: 'ALL',
        sdapt: 'ALL',
        country: 'HU',
        address: '1011 Budapest, Main St 1',
        zip: '1011',
        city: 'Budapest',
        street: 'Main St 1',
        findme: 'Next to the bank',
        geolat: 47.5,
        geolng: 19.0,
        allowed2: 'ALL' as const,
        depot: 'DEPOT1',
        load: 'normal loaded' as const,
        isOutdoor: false,
        apmType: 'Cleveron' as const,
        substitutes: [
          { place_id: 'APM002', operator_id: 'OP002' },
          { place_id: 'APM003', operator_id: 'OP003' },
        ],
        open: {
          hetfo: '08:00-20:00',
          kedd: '08:00-20:00',
          szerda: '08:00-20:00',
          csutortok: '08:00-20:00',
          pentek: '08:00-20:00',
          szombat: '08:00-18:00',
          vasarnap: '10:00-18:00',
        },
        fillEmptyList: [{ emptying: '19:00', filling: '08:00' }],
        cardPayment: true,
        cashPayment: true,
        iconUrl: 'https://example.com/icon.png',
        variant: 'FOXPOST A-BOX' as const,
        paymentOptions: ['card', 'cash'] as const,
        paymentOptionsString: 'kártya, készpénz',
        service: ['pickup', 'dispatch'] as const,
        serviceString: 'feladás, felvétel',
      };

      const result = safeValidateFoxpostApmEntry(validEntry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.place_id).toBe('APM001');
        expect(result.data.geolat).toBe(47.5);
        expect(result.data.geolng).toBe(19.0);
      }
    });

    it('should coerce numeric place_id to string', () => {
      const entry = {
        place_id: 12345,
        operator_id: 'OP001',
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.place_id).toBe('12345');
        expect(typeof result.data.place_id).toBe('string');
      }
    });

    it('should coerce string coordinates to numbers', () => {
      const entry = {
        place_id: 'APM001',
        geolat: '47.5123',
        geolng: '19.0456',
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.geolat).toBe(47.5123);
        expect(result.data.geolng).toBe(19.0456);
        expect(typeof result.data.geolat).toBe('number');
        expect(typeof result.data.geolng).toBe('number');
      }
    });

    it('should reject invalid coordinates (NaN)', () => {
      const entry = {
        place_id: 'APM001',
        geolat: 'not-a-number',
        geolng: 19.0,
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten();
        expect(errors.fieldErrors.geolat).toBeDefined();
      }
    });

    it('should handle null operator_id', () => {
      const entry = {
        place_id: 'APM001',
        operator_id: null,
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operator_id).toBeNull();
      }
    });

    it('should allow optional fields to be undefined', () => {
      const entry = {
        place_id: 'APM001',
        // All other fields omitted
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBeUndefined();
        expect(result.data.city).toBeUndefined();
      }
    });

    it('should validate load enum values (lenient - accepts any string)', () => {
      const validEntry = {
        place_id: 'APM001',
        load: 'normal loaded' as const,
      };
      const validResult = safeValidateFoxpostApmEntry(validEntry);
      expect(validResult.success).toBe(true);

      // With lenient validation, unknown load values are accepted
      const unknownLoadEntry = {
        place_id: 'APM001',
        load: 'extremely-overloaded',
      };
      const unknownResult = safeValidateFoxpostApmEntry(unknownLoadEntry);
      expect(unknownResult.success).toBe(true); // Now passes - lenient validation
    });

    it('should validate apmType enum values (lenient - accepts any string)', () => {
      const validEntry = {
        place_id: 'APM001',
        apmType: 'Cleveron' as const,
      };
      const validResult = safeValidateFoxpostApmEntry(validEntry);
      expect(validResult.success).toBe(true);

      // With lenient validation, unknown APM types are accepted (e.g., Packeta Z-BOX, Z-Pont)
      const unknownApmEntry = {
        place_id: 'APM001',
        apmType: 'UnknownBrand',
      };
      const unknownResult = safeValidateFoxpostApmEntry(unknownApmEntry);
      expect(unknownResult.success).toBe(true); // Now passes - lenient validation
    });

    it('should validate variant enum values (lenient - accepts any string)', () => {
      const validEntry = {
        place_id: 'APM001',
        variant: 'FOXPOST Z-BOX' as const,
      };
      const validResult = safeValidateFoxpostApmEntry(validEntry);
      expect(validResult.success).toBe(true);

      // With lenient validation, unknown variants are accepted
      const unknownVariantEntry = {
        place_id: 'APM001',
        variant: 'UNKNOWN-BOX',
      };
      const unknownResult = safeValidateFoxpostApmEntry(unknownVariantEntry);
      expect(unknownResult.success).toBe(true); // Now passes - lenient validation
    });

    it('should validate allowed2 enum values', () => {
      const validEntry = {
        place_id: 'APM001',
        allowed2: 'B2C' as const,
      };
      const validResult = safeValidateFoxpostApmEntry(validEntry);
      expect(validResult.success).toBe(true);

      const invalidEntry = {
        place_id: 'APM001',
        allowed2: 'INVALID',
      };
      const invalidResult = safeValidateFoxpostApmEntry(invalidEntry);
      expect(invalidResult.success).toBe(false);
    });

    it('should validate payment options enum values (lenient - accepts any string)', () => {
      const validEntry = {
        place_id: 'APM001',
        paymentOptions: ['card', 'cash', 'link', 'app'],
      };
      const validResult = safeValidateFoxpostApmEntry(validEntry);
      expect(validResult.success).toBe(true);

      // With lenient validation, unknown payment methods are accepted
      const unknownPaymentEntry = {
        place_id: 'APM001',
        paymentOptions: ['card', 'crypto', 'blockchain'],
      };
      const unknownResult = safeValidateFoxpostApmEntry(unknownPaymentEntry);
      expect(unknownResult.success).toBe(true); // Now passes - lenient validation
    });

    it('should validate service enum values (lenient - accepts any string)', () => {
      const validEntry = {
        place_id: 'APM001',
        service: ['pickup', 'dispatch'],
      };
      const validResult = safeValidateFoxpostApmEntry(validEntry);
      expect(validResult.success).toBe(true);

      // With lenient validation, unknown service types are accepted
      const unknownServiceEntry = {
        place_id: 'APM001',
        service: ['pickup', 'delivery', 'returns'],
      };
      const unknownResult = safeValidateFoxpostApmEntry(unknownServiceEntry);
      expect(unknownResult.success).toBe(true); // Now passes - lenient validation
    });

    it('should accept extra fields with passthrough', () => {
      const entry = {
        place_id: 'APM001',
        futureField: 'some_value',
        anotherUnknown: 123,
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).futureField).toBe('some_value');
        expect((result.data as any).anotherUnknown).toBe(123);
      }
    });
  });

  describe('safeValidateFoxpostApmFeed', () => {
    it('should validate an array of valid APM entries', () => {
      const feed = [
        {
          place_id: 'APM001',
          operator_id: 'OP001',
          name: 'APM #1',
        },
        {
          place_id: 'APM002',
          operator_id: 'OP002',
          name: 'APM #2',
        },
      ];

      const result = safeValidateFoxpostApmFeed(feed);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });

    it('should reject non-array feed', () => {
      const result = safeValidateFoxpostApmFeed({ entries: [] });
      expect(result.success).toBe(false);
    });

    it('should reject feed with invalid entries', () => {
      const feed = [
        {
          place_id: 'APM001',
          geolat: 'invalid-number',
        },
      ];

      const result = safeValidateFoxpostApmFeed(feed);
      expect(result.success).toBe(false);
    });

    it('should validate empty array', () => {
      const result = safeValidateFoxpostApmFeed([]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should handle mixed valid entries', () => {
      const feed = [
        {
          place_id: 'APM001',
          operator_id: 'OP001',
          geolat: '47.5',
          geolng: '19.0',
          load: 'normal loaded' as const,
        },
        {
          place_id: 12345, // numeric ID
          geolat: 47.6, // numeric coordinate
          variant: 'FOXPOST Z-BOX' as const,
        },
      ];

      const result = safeValidateFoxpostApmFeed(feed);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].place_id).toBe('APM001');
        expect(result.data[1].place_id).toBe('12345');
        expect(result.data[1].geolat).toBe(47.6);
      }
    });
  });

  describe('Real-world APM data coercion', () => {
    it('should handle real-world APM entry with numeric place_id and string coords', () => {
      const realEntry = {
        place_id: 1444335, // numeric from real API
        operator_id: 'hu5844',
        name: 'FOXPOST A-BOX Nyíregyháza',
        country: 'hu',
        city: 'Nyíregyháza',
        zip: '4400',
        street: 'Hősök tere 15.',
        address: '4400 Nyíregyháza, Hősök tere 15.',
        geolat: '47.956969', // string from JSON
        geolng: '21.716012', // string from JSON
        allowed2: 'ALL' as const,
        isOutdoor: false,
        apmType: 'Rollkon' as const,
        load: 'normal loaded' as const,
        cardPayment: true,
        cashPayment: false,
        variant: 'FOXPOST A-BOX' as const,
        paymentOptions: ['card', 'link'] as const,
        service: ['pickup', 'dispatch'] as const,
      };

      const result = safeValidateFoxpostApmEntry(realEntry);
      expect(result.success).toBe(true);
      if (result.success) {
        // Verify coercion
        expect(result.data.place_id).toBe('1444335');
        expect(result.data.geolat).toBe(47.956969);
        expect(result.data.geolng).toBe(21.716012);
        expect(typeof result.data.geolat).toBe('number');
        expect(typeof result.data.geolng).toBe('number');
      }
    });

    it('should handle APM with minimal fields', () => {
      const minimalEntry = {
        place_id: 'APM-MIN-001',
      };

      const result = safeValidateFoxpostApmEntry(minimalEntry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.place_id).toBe('APM-MIN-001');
        expect(result.data.name).toBeUndefined();
        expect(result.data.city).toBeUndefined();
      }
    });

    it('should handle APM with null opening hours fields', () => {
      const entry = {
        place_id: 'APM001',
        open: {
          hetfo: '08:00-20:00',
          kedd: null,
          szerda: null,
        },
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.open?.hetfo).toBe('08:00-20:00');
        expect(result.data.open?.kedd).toBeNull();
      }
    });

    it('should handle fill/empty list with partial fields', () => {
      const entry = {
        place_id: 'APM001',
        fillEmptyList: [
          { emptying: '19:00', filling: '08:00' },
          { emptying: '14:00' }, // filling omitted
        ],
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fillEmptyList).toHaveLength(2);
        expect(result.data.fillEmptyList?.[1].emptying).toBe('14:00');
      }
    });

    it('should handle substitutes array with objects', () => {
      const entry = {
        place_id: 'APM001',
        substitutes: [
          { place_id: 'APM002', operator_id: 'OP002' },
          { place_id: 123, operator_id: 'OP003' }, // numeric place_id coerced to string
          { place_id: 'APM004' }, // operator_id omitted
        ],
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.substitutes).toHaveLength(3);
        expect(result.data.substitutes?.[0].place_id).toBe('APM002');
        expect(result.data.substitutes?.[1].place_id).toBe('123'); // Coerced to string
        expect(result.data.substitutes?.[2].operator_id).toBeUndefined();
      }
    });
  });

  describe('Type inference and safety', () => {
    it('should infer correct types from validated entry', () => {
      const entry = {
        place_id: 'APM001',
        operator_id: 'OP001',
        load: 'normal loaded' as const,
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        // Type is inferred as FoxpostApmEntry
        const typedEntry: FoxpostApmEntry = result.data;
        expect(typedEntry.place_id).toBe('APM001');
        // load should be properly typed
        if (typedEntry.load) {
          expect(['normal loaded', 'medium loaded', 'overloaded']).toContain(typedEntry.load);
        }
      }
    });

    it('should preserve extra fields in validated result', () => {
      const entry = {
        place_id: 'APM001',
        customField: 'custom_value',
        apiVersion: '2',
      };

      const result = safeValidateFoxpostApmEntry(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).customField).toBe('custom_value');
        expect((result.data as any).apiVersion).toBe('2');
      }
    });
  });
});
