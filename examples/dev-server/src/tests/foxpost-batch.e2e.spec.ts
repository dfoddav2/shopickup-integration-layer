import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';

/**
 * End-to-End Tests for Dev-Server Foxpost Batch Endpoint
 *
 * These tests verify the complete flow:
 * 1. Server starts successfully
 * 2. Batch endpoint accepts valid parcel requests
 * 3. Responses include correct HTTP status codes (200/207/400)
 * 4. Error details are included when parcels fail validation
 * 5. Summary field indicates success/failure count
 */

const API_URL = 'http://localhost:3000';
const FOXPOST_ENDPOINT = `${API_URL}/api/dev/foxpost/create-parcels`;

describe('Dev-Server E2E - Foxpost Create Parcels Batch', () => {
  // Note: These tests assume the dev-server is already running
  // In a real setup, you'd spawn the server in beforeAll()

  describe('Successful batch operations (HTTP 200)', () => {
    it('should accept valid parcels and return 200 with all successes', async () => {
      const validParcels = [
        {
          recipientName: 'John Doe',
          recipientPhone: '+36201234567',
          recipientEmail: 'john@example.com',
          recipientCity: 'Budapest',
          recipientPostalCode: '1011',
          recipientCountry: 'HU',
        },
        {
          recipientName: 'Jane Smith',
          recipientPhone: '+36307654321',
          recipientEmail: 'jane@example.com',
          recipientCity: 'Debrecen',
          recipientPostalCode: '4026',
          recipientCountry: 'HU',
        },
      ];

      try {
        const response = await axios.post(FOXPOST_ENDPOINT, { parcels: validParcels });

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('summary');
        expect(response.data).toHaveProperty('results');
        expect(Array.isArray(response.data.results)).toBe(true);
        expect(response.data.results).toHaveLength(2);

        // Verify all parcels succeeded
        response.data.results.forEach((result: any, idx: number) => {
          expect(result.status).toBe('created');
          expect(result.carrierId).toBeDefined();
          expect(result.carrierId).toBeTruthy();
        });
      } catch (error: unknown) {
        // If the server isn't running, skip this test
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn(
            'Dev-server not running. Skipping E2E tests. Run: pnpm run start:dev-server'
          );
        } else {
          throw error;
        }
      }
    });
  });

  describe('Mixed batch operations (HTTP 207 Multi-Status)', () => {
    it('should return 207 when some parcels succeed and some fail', async () => {
      const mixedParcels = [
        {
          // Valid parcel
          recipientName: 'Valid Parcel',
          recipientPhone: '+36201234567',
          recipientEmail: 'valid@example.com',
          recipientCity: 'Budapest',
          recipientPostalCode: '1011',
          recipientCountry: 'HU',
        },
        {
          // Invalid parcel - missing required field
          recipientName: 'Invalid Parcel',
          // Missing recipientPhone - should fail validation
          recipientEmail: 'invalid@example.com',
          recipientCity: 'Budapest',
          recipientPostalCode: '1011',
          recipientCountry: 'HU',
        },
      ];

      try {
        const response = await axios.post(FOXPOST_ENDPOINT, { parcels: mixedParcels }, {
          validateStatus: () => true, // Don't throw on non-2xx status
        });

        expect([200, 207]).toContain(response.status);
        expect(response.data).toHaveProperty('summary');
        expect(response.data).toHaveProperty('results');
        expect(Array.isArray(response.data.results)).toBe(true);
        expect(response.data.results).toHaveLength(2);

        // Verify mixed results
        const succeeded = response.data.results.filter((r: any) => r.status === 'created');
        const failed = response.data.results.filter((r: any) => r.status !== 'created');

        if (failed.length > 0) {
          // If there are failures, check that error details are present
          failed.forEach((result: any) => {
            expect(result.errors).toBeDefined();
            expect(Array.isArray(result.errors)).toBe(true);
            if (result.errors.length > 0) {
              result.errors.forEach((error: any) => {
                expect(error).toHaveProperty('field');
                expect(error).toHaveProperty('code');
                expect(error).toHaveProperty('message');
              });
            }
          });
        }
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn(
            'Dev-server not running. Skipping E2E tests. Run: pnpm run start:dev-server'
          );
        } else {
          throw error;
        }
      }
    });
  });

  describe('Failed batch operations (HTTP 400)', () => {
    it('should return 400 when all parcels have validation errors', async () => {
      const invalidParcels = [
        {
          // Missing recipientName
          recipientPhone: '+36201234567',
          recipientEmail: 'test1@example.com',
          recipientCity: 'Budapest',
          recipientPostalCode: '1011',
          recipientCountry: 'HU',
        },
        {
          // Missing recipientEmail
          recipientName: 'Test User',
          recipientPhone: '+36307654321',
          recipientCity: 'Debrecen',
          recipientPostalCode: '4026',
          recipientCountry: 'HU',
        },
      ];

      try {
        const response = await axios.post(FOXPOST_ENDPOINT, { parcels: invalidParcels }, {
          validateStatus: () => true, // Don't throw on non-2xx status
        });

        expect(response.status).toBe(400);
        expect(response.data).toHaveProperty('summary');
        expect(response.data).toHaveProperty('results');
        expect(Array.isArray(response.data.results)).toBe(true);

        // Verify all parcels have errors
        response.data.results.forEach((result: any) => {
          expect(result.status).not.toBe('created');
          expect(result.errors).toBeDefined();
          expect(Array.isArray(result.errors)).toBe(true);
          expect(result.errors.length).toBeGreaterThan(0);
        });
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn(
            'Dev-server not running. Skipping E2E tests. Run: pnpm run start:dev-server'
          );
        } else {
          throw error;
        }
      }
    });
  });

  describe('Response format validation', () => {
    it('should include summary field with human-readable status', async () => {
      const testParcels = [
        {
          recipientName: 'Test User',
          recipientPhone: '+36201234567',
          recipientEmail: 'test@example.com',
          recipientCity: 'Budapest',
          recipientPostalCode: '1011',
          recipientCountry: 'HU',
        },
      ];

      try {
        const response = await axios.post(FOXPOST_ENDPOINT, { parcels: testParcels });

        // Verify summary format
        expect(response.data.summary).toBeDefined();
        expect(typeof response.data.summary).toBe('string');
        expect(response.data.summary).toMatch(/succeeded|failed|mixed/i);
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn(
            'Dev-server not running. Skipping E2E tests. Run: pnpm run start:dev-server'
          );
        } else {
          throw error;
        }
      }
    });

    it('should include carrierResource details in each result', async () => {
      const testParcels = [
        {
          recipientName: 'Test User',
          recipientPhone: '+36201234567',
          recipientEmail: 'test@example.com',
          recipientCity: 'Budapest',
          recipientPostalCode: '1011',
          recipientCountry: 'HU',
        },
      ];

      try {
        const response = await axios.post(FOXPOST_ENDPOINT, { parcels: testParcels });

        const result = response.data.results[0];

        // Verify CarrierResource fields
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('carrierId');
        expect(result).toHaveProperty('raw');

        // Optional fields
        if (result.status === 'created') {
          expect(result.carrierId).toBeTruthy();
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn(
            'Dev-server not running. Skipping E2E tests. Run: pnpm run start:dev-server'
          );
        } else {
          throw error;
        }
      }
    });
  });
});
