/**
 * Unit tests for Foxpost status mapping
 * 
 * Tests the comprehensive status map with English and Hungarian descriptions
 * and ensures canonical status mapping is accurate.
 */

import {
  FOXPOST_STATUS_MAP,
  mapFoxpostStatusCode,
  getFoxpostStatusDescription,
  type FoxpostStatusMapping,
} from '../mappers/trackStatus';

describe('Foxpost Status Mapping', () => {
  // === Canonical Status Mapping Tests ===

  describe('mapFoxpostStatusCode - canonical statuses', () => {
    it('should map CREATE to PENDING', () => {
      const result = mapFoxpostStatusCode('CREATE');
      expect(result.canonical).toBe('PENDING');
    });

    it('should map OPERIN to IN_TRANSIT', () => {
      const result = mapFoxpostStatusCode('OPERIN');
      expect(result.canonical).toBe('IN_TRANSIT');
    });

    it('should map RECEIVE to DELIVERED', () => {
      const result = mapFoxpostStatusCode('RECEIVE');
      expect(result.canonical).toBe('DELIVERED');
    });

    it('should map HDSENT to OUT_FOR_DELIVERY', () => {
      const result = mapFoxpostStatusCode('HDSENT');
      expect(result.canonical).toBe('OUT_FOR_DELIVERY');
    });

    it('should map HDINTRANSIT to OUT_FOR_DELIVERY', () => {
      const result = mapFoxpostStatusCode('HDINTRANSIT');
      expect(result.canonical).toBe('OUT_FOR_DELIVERY');
    });

    it('should map RETURN to RETURNED', () => {
      const result = mapFoxpostStatusCode('RETURN');
      expect(result.canonical).toBe('RETURNED');
    });

    it('should map HDUNDELIVERABLE to EXCEPTION', () => {
      const result = mapFoxpostStatusCode('HDUNDELIVERABLE');
      expect(result.canonical).toBe('EXCEPTION');
    });

    it('should map unknown code to PENDING (fallback)', () => {
      const result = mapFoxpostStatusCode('FOOBAR');
      expect(result.canonical).toBe('PENDING');
    });
  });

  // === Human-Readable Description Tests ===

  describe('mapFoxpostStatusCode - human descriptions', () => {
    it('should provide English description for OPERIN', () => {
      const result = mapFoxpostStatusCode('OPERIN');
      expect(result.human_en).toBe('Arrived at locker');
    });

    it('should provide Hungarian description for OPERIN', () => {
      const result = mapFoxpostStatusCode('OPERIN');
      expect(result.human_hu).toBe('Automatában megérkezett');
    });

    it('should provide English description for RECEIVE', () => {
      const result = mapFoxpostStatusCode('RECEIVE');
      expect(result.human_en).toBe('Delivered to recipient');
    });

    it('should provide Hungarian description for RECEIVE', () => {
      const result = mapFoxpostStatusCode('RECEIVE');
      expect(result.human_hu).toBe('Átvéve');
    });

    it('should provide fallback for unknown code (English)', () => {
      const result = mapFoxpostStatusCode('UNKNOWN123');
      expect(result.human_en).toBe('Foxpost: UNKNOWN123');
    });

    it('should not provide Hungarian description for unknown code', () => {
      const result = mapFoxpostStatusCode('UNKNOWN123');
      expect(result.human_hu).toBeUndefined();
    });
  });

  // === getFoxpostStatusDescription Tests ===

  describe('getFoxpostStatusDescription', () => {
    it('should return English description by default', () => {
      const desc = getFoxpostStatusDescription('OPERIN');
      expect(desc).toBe('Arrived at locker');
    });

    it('should return English description when explicitly requested', () => {
      const desc = getFoxpostStatusDescription('OPERIN', 'en');
      expect(desc).toBe('Arrived at locker');
    });

    it('should return Hungarian description when requested', () => {
      const desc = getFoxpostStatusDescription('OPERIN', 'hu');
      expect(desc).toBe('Automatában megérkezett');
    });

    it('should fallback to English for unknown code in Hungarian mode', () => {
      const desc = getFoxpostStatusDescription('UNKNOWN123', 'hu');
      expect(desc).toBe('Foxpost: UNKNOWN123');
    });

    it('should provide description for HOME DELIVERY codes', () => {
      const desc = getFoxpostStatusDescription('HDSENT', 'en');
      expect(desc).toBe('Home delivery sent');
    });
  });

  // === Coverage Tests ===

  describe('Status map completeness', () => {
    it('should have all Foxpost OpenAPI status codes', () => {
      const expectedCodes = [
        'CREATE', 'OPERIN', 'OPEROUT', 'RECEIVE', 'RETURN', 'REDIRECT',
        'OVERTIMEOUT', 'SORTIN', 'SORTOUT', 'SLOTCHANGE', 'OVERTIMED',
        'MPSIN', 'C2CIN', 'HDSENT', 'HDDEPO', 'HDINTRANSIT', 'HDRETURN',
        'HDRECEIVE', 'WBXREDIRECT', 'BACKTOSENDER', 'HDHUBIN', 'HDHUBOUT',
        'HDCOURIER', 'HDUNDELIVERABLE', 'PREPAREDFORPD', 'INWAREHOUSE',
        'COLLECTSENT', 'C2BIN', 'RETURNED', 'COLLECTED', 'BACKLOGINFULL',
        'BACKLOGINFAIL', 'MISSORT', 'EMPTYSLOT', 'RESENT', 'PREREDIRECT',
      ];

      expectedCodes.forEach(code => {
        const mapping = FOXPOST_STATUS_MAP[code];
        expect(mapping).toBeDefined(`Status code ${code} should be in map`);
        expect(mapping.canonical).toBeTruthy(`Status code ${code} should have canonical mapping`);
        expect(mapping.human_en).toBeTruthy(`Status code ${code} should have English description`);
      });
    });

    it('should map all codes to valid canonical statuses', () => {
      const validStatuses = ['PENDING', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'RETURNED', 'CANCELLED', 'UNKNOWN'];

      Object.entries(FOXPOST_STATUS_MAP).forEach(([code, mapping]) => {
        expect(validStatuses).toContain(mapping.canonical, `Code ${code} maps to invalid canonical status: ${mapping.canonical}`);
      });
    });
  });

  // === Specific Status Group Tests ===

  describe('Status groups', () => {
    it('should map locker operations correctly', () => {
      const lockerStatuses = ['CREATE', 'OPERIN', 'OPEROUT', 'RECEIVE'];
      lockerStatuses.forEach(code => {
        const mapping = mapFoxpostStatusCode(code);
        expect(mapping.type).toBe('locker');
      });
    });

    it('should map home delivery operations correctly', () => {
      const hdStatuses = ['HDSENT', 'HDINTRANSIT', 'HDDEPO', 'HDCOURIER', 'HDHUBIN', 'HDHUBOUT', 'HDRECEIVE', 'HDRETURN'];
      hdStatuses.forEach(code => {
        const mapping = mapFoxpostStatusCode(code);
        expect(['courier', 'facility']).toContain(mapping.type);
      });
    });

    it('should map exception states correctly', () => {
      const exceptionCodes = ['OVERTIMEOUT', 'OVERTIMED', 'HDUNDELIVERABLE', 'MISSORT', 'EMPTYSLOT', 'BACKLOGINFULL', 'BACKLOGINFAIL'];
      exceptionCodes.forEach(code => {
        const mapping = mapFoxpostStatusCode(code);
        expect(mapping.canonical).toBe('EXCEPTION');
      });
    });

    it('should map return states correctly', () => {
      const returnCodes = ['RETURN', 'BACKTOSENDER', 'HDRETURN'];
      returnCodes.forEach(code => {
        const mapping = mapFoxpostStatusCode(code);
        expect(mapping.canonical).toBe('RETURNED');
      });
    });
  });

  // === Edge Cases ===

  describe('Edge cases', () => {
    it('should handle case sensitivity (codes are uppercase)', () => {
      // Codes should be uppercase; lowercase should not be found
      const result = mapFoxpostStatusCode('operin');
      expect(result.canonical).toBe('PENDING'); // Fallback for unknown
    });

    it('should handle empty string', () => {
      const result = mapFoxpostStatusCode('');
      expect(result.canonical).toBe('PENDING'); // Fallback for unknown
      expect(result.human_en).toBe('Foxpost: ');
    });

    it('should handle null-like strings', () => {
      const result = mapFoxpostStatusCode('null');
      expect(result.canonical).toBe('PENDING'); // Fallback for unknown
    });

    it('should provide both languages for all mapped codes', () => {
      Object.entries(FOXPOST_STATUS_MAP).forEach(([code, mapping]) => {
        expect(mapping.human_en).toBeTruthy(`${code} missing English description`);
        // Hungarian is optional for some codes, but we provide it for all in current map
        if (!mapping.human_hu) {
          expect(mapping.type).toBe('technical'); // Only technical codes might lack Hungarian
        }
      });
    });
  });

  // === Type Safety Tests ===

  describe('Type safety', () => {
    it('should return FoxpostStatusMapping type', () => {
      const mapping = mapFoxpostStatusCode('OPERIN');
      expect(typeof mapping.canonical).toBe('string');
      expect(typeof mapping.human_en).toBe('string');
      expect(mapping.type).toBeDefined();
    });

    it('should have correct type for all mappings', () => {
      Object.values(FOXPOST_STATUS_MAP).forEach(mapping => {
        const validTypes = ['locker', 'courier', 'facility', 'technical', undefined];
        expect(validTypes).toContain(mapping.type);
      });
    });
  });
});
