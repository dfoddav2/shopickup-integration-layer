/**
 * GLS Tracking Tests
 * 
 * Tests for mapping GLS tracking responses to canonical TrackingUpdate format
 * and validation of tracking requests/responses
 */

import { describe, it, expect } from 'vitest';
import {
  mapGLSStatusToTrackingEvent,
  mapGLSTrackingResponseToCanonical,
} from '../mappers/tracking.js';
import {
  safeValidateTrackingRequest,
  safeValidateGLSTrackingRequest,
  safeValidateGLSTrackingResponse,
  isValidPODFormat,
  isValidStatusDate,
} from '../validation/tracking.js';
import type { GLSParcelStatus, GLSGetParcelStatusesResponse } from '../types/index.js';

/**
 * ============================================
 * Mapper Tests
 * ============================================
 */

describe('GLS Tracking Mapper', () => {
  describe('mapGLSStatusToTrackingEvent', () => {
    it('should map GLS status code 1 (Handed over) to PENDING', () => {
      const glsStatus: GLSParcelStatus = {
        statusCode: '1',
        statusDate: '2024-01-15T08:00:00Z',
        statusDescription: 'Handed over to GLS',
        depotCity: 'Budapest',
        depotNumber: '0001',
      };

      const event = mapGLSStatusToTrackingEvent(glsStatus);

      expect(event.status).toBe('PENDING');
      expect(event.carrierStatusCode).toBe('1');
      expect(event.description).toBe('Handed over to GLS');
      expect(event.location?.city).toBe('Budapest');
      expect(event.location?.facility).toBe('0001');
    });

    it('should map GLS status code 5 (Delivered) to DELIVERED', () => {
      const glsStatus: GLSParcelStatus = {
        statusCode: '5',
        statusDate: '2024-01-17T14:30:00Z',
        statusDescription: 'Delivered',
        depotCity: 'Budapest',
        depotNumber: '0001',
      };

      const event = mapGLSStatusToTrackingEvent(glsStatus);

      expect(event.status).toBe('DELIVERED');
      expect(event.carrierStatusCode).toBe('5');
    });

    it('should map GLS status codes to appropriate canonical statuses', () => {
      const testCases = [
        { code: '2', expected: 'IN_TRANSIT', desc: 'Left parcel center' },
        { code: '3', expected: 'IN_TRANSIT', desc: 'Reached parcel center' },
      ];

      for (const tc of testCases) {
        const glsStatus: GLSParcelStatus = {
          statusCode: tc.code,
          statusDate: '2024-01-16T10:00:00Z',
          statusDescription: tc.desc,
          depotCity: 'Budapest',
          depotNumber: '0001',
        };

        const event = mapGLSStatusToTrackingEvent(glsStatus);
        expect(event.status).toBe(tc.expected);
      }
    });

    it('should map exception codes (6-40) to appropriate statuses', () => {
      // Test a few exception codes
      const exceptionCodes = [
        { code: '13', expected: 'EXCEPTION', desc: 'Sorting error' },
        { code: '17', expected: 'EXCEPTION', desc: 'Recipient refused' },
        { code: '36', expected: 'EXCEPTION', desc: 'Lost parcel' },
      ];

      for (const tc of exceptionCodes) {
        const glsStatus: GLSParcelStatus = {
          statusCode: tc.code,
          statusDate: '2024-01-16T15:00:00Z',
          statusDescription: tc.desc,
          depotCity: 'Budapest',
          depotNumber: '0001',
        };

        const event = mapGLSStatusToTrackingEvent(glsStatus);
        expect(event.status).toBe(tc.expected);
      }
    });

    it('should map status code 23 (Returned) to RETURNED', () => {
      const glsStatus: GLSParcelStatus = {
        statusCode: '23',
        statusDate: '2024-01-18T16:00:00Z',
        statusDescription: 'Returned to sender',
        depotCity: 'Budapest',
        depotNumber: '0001',
      };

      const event = mapGLSStatusToTrackingEvent(glsStatus);

      expect(event.status).toBe('RETURNED');
      expect(event.carrierStatusCode).toBe('23');
    });

    it('should default to PENDING for unknown status codes', () => {
      const glsStatus: GLSParcelStatus = {
        statusCode: '999',
        statusDate: '2024-01-15T08:00:00Z',
        statusDescription: 'Unknown status',
        depotCity: 'Budapest',
        depotNumber: '0001',
      };

      const event = mapGLSStatusToTrackingEvent(glsStatus);

      expect(event.status).toBe('PENDING');
      expect(event.carrierStatusCode).toBe('999');
    });

    it('should preserve raw GLS status in event', () => {
      const glsStatus: GLSParcelStatus = {
        statusCode: '1',
        statusDate: '2024-01-15T08:00:00Z',
        statusDescription: 'Handed over to GLS',
        depotCity: 'Budapest',
        depotNumber: '0001',
        statusInfo: 'Extra info',
      };

      const event = mapGLSStatusToTrackingEvent(glsStatus);

      expect(event.raw).toBe(glsStatus);
    });
  });

  describe('mapGLSTrackingResponseToCanonical', () => {
    it('should map GLS response with single status to TrackingUpdate', () => {
      const glsResponse: GLSGetParcelStatusesResponse = {
        parcelNumber: 123456789,
        clientReference: 'ORD-2024-001',
        deliveryCountryCode: 'HU',
        deliveryZipCode: '1056',
        weight: 2.5,
        parcelStatusList: [
          {
            statusCode: '1',
            statusDate: '2024-01-15T08:00:00Z',
            statusDescription: 'Handed over to GLS',
            depotCity: 'Budapest',
            depotNumber: '0001',
          },
        ],
      };

      const update = mapGLSTrackingResponseToCanonical(glsResponse);

      expect(update.trackingNumber).toBe('123456789');
      expect(update.events).toHaveLength(1);
      expect(update.events[0].status).toBe('PENDING');
      expect(update.status).toBe('PENDING'); // Current status from latest event
      expect(update.lastUpdate).toEqual(new Date('2024-01-15T08:00:00Z'));
      expect(update.rawCarrierResponse).toBe(glsResponse);
    });

    it('should sort events chronologically', () => {
      const glsResponse: GLSGetParcelStatusesResponse = {
        parcelNumber: 123456789,
        parcelStatusList: [
          {
            statusCode: '5',
            statusDate: '2024-01-17T14:30:00Z',
            statusDescription: 'Delivered',
            depotCity: 'Budapest',
            depotNumber: '0001',
          },
          {
            statusCode: '1',
            statusDate: '2024-01-15T08:00:00Z',
            statusDescription: 'Handed over to GLS',
            depotCity: 'Budapest',
            depotNumber: '0001',
          },
          {
            statusCode: '4',
            statusDate: '2024-01-17T08:00:00Z',
            statusDescription: 'Out for delivery',
            depotCity: 'Budapest',
            depotNumber: '0001',
          },
        ],
      };

      const update = mapGLSTrackingResponseToCanonical(glsResponse);

      expect(update.events).toHaveLength(3);
      expect(update.events[0].status).toBe('PENDING'); // 1/15
      expect(update.events[1].status).toBe('OUT_FOR_DELIVERY'); // 1/17 08:00
      expect(update.events[2].status).toBe('DELIVERED'); // 1/17 14:30
    });

    it('should use last event as current status', () => {
      const glsResponse: GLSGetParcelStatusesResponse = {
        parcelNumber: 123456789,
        parcelStatusList: [
          {
            statusCode: '1',
            statusDate: '2024-01-15T08:00:00Z',
            statusDescription: 'Handed over to GLS',
            depotCity: 'Budapest',
            depotNumber: '0001',
          },
          {
            statusCode: '2',
            statusDate: '2024-01-16T10:00:00Z',
            statusDescription: 'Left parcel center',
            depotCity: 'Budapest',
            depotNumber: '0001',
          },
        ],
      };

      const update = mapGLSTrackingResponseToCanonical(glsResponse);

      expect(update.status).toBe('IN_TRANSIT'); // Last event is IN_TRANSIT
      expect(update.lastUpdate).toEqual(new Date('2024-01-16T10:00:00Z'));
    });

    it('should default to PENDING status when no events', () => {
      const glsResponse: GLSGetParcelStatusesResponse = {
        parcelNumber: 123456789,
        parcelStatusList: [],
      };

      const update = mapGLSTrackingResponseToCanonical(glsResponse);

      expect(update.status).toBe('PENDING');
      expect(update.lastUpdate).toBeNull();
      expect(update.events).toHaveLength(0);
    });

    it('should handle missing optional fields', () => {
      const glsResponse: GLSGetParcelStatusesResponse = {
        parcelNumber: 123456789,
        parcelStatusList: [
          {
            statusCode: '1',
            statusDate: '2024-01-15T08:00:00Z',
            statusDescription: 'Status',
            depotCity: '',
            depotNumber: '',
          },
        ],
      };

      const update = mapGLSTrackingResponseToCanonical(glsResponse);

      expect(update.trackingNumber).toBe('123456789');
      expect(update.events[0].location?.city).toBe('');
      expect(update.events[0].location?.facility).toBe('');
    });
  });
});

/**
 * ============================================
 * Validation Tests
 * ============================================
 */

describe('GLS Tracking Validation', () => {
  describe('safeValidateTrackingRequest', () => {
    it('should validate a valid tracking request', () => {
      const request = {
        trackingNumber: '123456789',
        credentials: {
          username: 'testuser',
          password: 'testpass',
          clientNumberList: [1001],
        },
      };

      const result = safeValidateTrackingRequest(request);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(request);
    });

    it('should require tracking number', () => {
      const request = {
        credentials: {
          username: 'testuser',
          password: 'testpass',
          clientNumberList: [1001],
        },
      };

      const result = safeValidateTrackingRequest(request);

      expect(result.success).toBe(false);
    });

    it('should reject empty tracking number', () => {
      const request = {
        trackingNumber: '',
        credentials: {},
      };

      const result = safeValidateTrackingRequest(request);

      expect(result.success).toBe(false);
    });

    it('should allow optional credentials', () => {
      const request = {
        trackingNumber: '123456789',
      };

      const result = safeValidateTrackingRequest(request);

      expect(result.success).toBe(true);
    });

    it('should allow optional options', () => {
      const request = {
        trackingNumber: '123456789',
        options: {
          useTestApi: true,
        },
      };

      const result = safeValidateTrackingRequest(request);

      expect(result.success).toBe(true);
    });
  });

  describe('safeValidateGLSTrackingRequest', () => {
    it('should validate a valid GLS tracking request', () => {
      const request = {
        parcelNumber: 123456789,
        returnPOD: false,
        languageIsoCode: 'EN',
      };

      const result = safeValidateGLSTrackingRequest(request);

      expect(result.success).toBe(true);
    });

    it('should require parcel number', () => {
      const request = {
        returnPOD: false,
      };

      const result = safeValidateGLSTrackingRequest(request);

      expect(result.success).toBe(false);
    });

    it('should reject non-positive parcel numbers', () => {
      const testCases = [0, -1, -100];

      for (const num of testCases) {
        const request = { parcelNumber: num };
        const result = safeValidateGLSTrackingRequest(request);
        expect(result.success).toBe(false);
      }
    });

    it('should accept valid language codes', () => {
      const validCodes = ['HR', 'CS', 'HU', 'RO', 'SK', 'SL', 'EN'];

      for (const code of validCodes) {
        const request = { parcelNumber: 123456789, languageIsoCode: code };
        const result = safeValidateGLSTrackingRequest(request);
        expect(result.success).toBe(true);
      }
    });

    it('should accept lowercase language codes and convert', () => {
      const request = { parcelNumber: 123456789, languageIsoCode: 'en' };
      const result = safeValidateGLSTrackingRequest(request);
      expect(result.success).toBe(true);
    });

    it('should reject invalid language codes', () => {
      const request = { parcelNumber: 123456789, languageIsoCode: 'XX' };
      const result = safeValidateGLSTrackingRequest(request);
      expect(result.success).toBe(false);
    });

    it('should require returnPOD to be boolean if provided', () => {
      const request = { parcelNumber: 123456789, returnPOD: 'yes' };
      const result = safeValidateGLSTrackingRequest(request);
      expect(result.success).toBe(false);
    });
  });

  describe('safeValidateGLSTrackingResponse', () => {
    it('should validate a valid GLS tracking response', () => {
      const response: GLSGetParcelStatusesResponse = {
        parcelNumber: 123456789,
        parcelStatusList: [
          {
            statusCode: '1',
            statusDate: '2024-01-15T08:00:00Z',
            statusDescription: 'Status',
            depotCity: 'Budapest',
            depotNumber: '0001',
          },
        ],
      };

      const result = safeValidateGLSTrackingResponse(response);

      expect(result.success).toBe(true);
    });

    it('should require parcel number', () => {
      const response = {
        parcelStatusList: [],
      };

      const result = safeValidateGLSTrackingResponse(response);

      expect(result.success).toBe(false);
    });

    it('should accept null parcelStatusList', () => {
      const response: GLSGetParcelStatusesResponse = {
        parcelNumber: 123456789,
        parcelStatusList: undefined,
      };

      const result = safeValidateGLSTrackingResponse(response);

      expect(result.success).toBe(true);
    });

    it('should reject invalid status items', () => {
      const response: GLSGetParcelStatusesResponse = {
        parcelNumber: 123456789,
        parcelStatusList: [
          {
            // Missing statusCode
            statusDate: '2024-01-15T08:00:00Z',
            statusDescription: 'Status',
          } as any,
        ],
      };

      const result = safeValidateGLSTrackingResponse(response);

      expect(result.success).toBe(false);
    });

    it('should validate POD format if provided', () => {
      const response: GLSGetParcelStatusesResponse = {
        parcelNumber: 123456789,
        pod: 'base64encodeddata',
      };

      const result = safeValidateGLSTrackingResponse(response);

      expect(result.success).toBe(true);
    });

    it('should reject invalid POD format', () => {
      const response = {
        parcelNumber: 123456789,
        pod: 12345, // Invalid - should be string, Buffer, or Uint8Array
      };

      const result = safeValidateGLSTrackingResponse(response);

      expect(result.success).toBe(false);
    });
  });

  describe('isValidPODFormat', () => {
    it('should validate string (base64) POD', () => {
      expect(isValidPODFormat('base64encodedstring')).toBe(true);
    });

    it('should validate Buffer POD', () => {
      const buf = Buffer.from('test data');
      expect(isValidPODFormat(buf)).toBe(true);
    });

    it('should validate Uint8Array POD', () => {
      const arr = new Uint8Array([1, 2, 3, 4, 5]);
      expect(isValidPODFormat(arr)).toBe(true);
    });

    it('should reject invalid POD types', () => {
      expect(isValidPODFormat(12345)).toBe(false);
      expect(isValidPODFormat({})).toBe(false);
      expect(isValidPODFormat([])).toBe(false);
    });
  });

  describe('isValidStatusDate', () => {
    it('should validate ISO string dates', () => {
      expect(isValidStatusDate('2024-01-15T08:00:00Z')).toBe(true);
      expect(isValidStatusDate('2024-01-15')).toBe(true);
    });

    it('should validate numeric timestamps', () => {
      const timestamp = Date.now();
      expect(isValidStatusDate(timestamp)).toBe(true);
    });

    it('should reject invalid date formats', () => {
      expect(isValidStatusDate('invalid date')).toBe(false);
      expect(isValidStatusDate('2024-13-45')).toBe(false);
    });

    it('should reject non-date types', () => {
      expect(isValidStatusDate({})).toBe(false);
      expect(isValidStatusDate([])).toBe(false);
      expect(isValidStatusDate(null)).toBe(false);
    });
  });
});
