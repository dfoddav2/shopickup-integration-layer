import { describe, it, expect, beforeEach } from 'vitest';
import { MPLAdapter } from '../index.js';
import type {
  AdapterContext,
  Parcel,
  HttpResponse,
  CreateParcelRequest,
  CreateParcelsRequest,
  CreateParcelsResponse,
  Logger,
} from '@shopickup/core';
import { CarrierError } from '@shopickup/core';

/**
 * Mock HTTP Client for testing
 */
class MockHttpClient {
  private responses: Map<string, any> = new Map();
  private throwError: Error | null = null;
  lastPostUrl?: string;
  lastPostData?: any;

  setResponse(url: string, data: any): void {
    this.responses.set(url, data);
  }

  setError(error: Error): void {
    this.throwError = error;
  }

  async post<T>(url: string, data: any, options?: any): Promise<HttpResponse<T>> {
    this.lastPostUrl = url;
    this.lastPostData = data;

    if (this.throwError) {
      throw this.throwError;
    }

    const response = this.responses.get(url);
    if (!response) {
      throw new Error(`No mock response configured for ${url}`);
    }

    return response as HttpResponse<T>;
  }

  async get<T>(url: string, options?: any): Promise<HttpResponse<T>> {
    const response = this.responses.get(url);
    if (!response) {
      throw new Error(`No mock response configured for ${url}`);
    }
    return response as HttpResponse<T>;
  }

  async put<T>(url: string, data?: any, options?: any): Promise<HttpResponse<T>> {
    throw new Error('PUT not implemented in mock');
  }

  async patch<T>(url: string, data?: any, options?: any): Promise<HttpResponse<T>> {
    throw new Error('PATCH not implemented in mock');
  }

  async delete<T>(url: string, options?: any): Promise<HttpResponse<T>> {
    throw new Error('DELETE not implemented in mock');
  }
}

/**
 * Mock Logger for capturing logs
 */
class MockLogger implements Logger {
  logs: any[] = [];

  debug(msg: string, data?: any): void {
    this.logs.push({ level: 'debug', msg, data });
  }

  info(msg: string, data?: any): void {
    this.logs.push({ level: 'info', msg, data });
  }

  warn(msg: string, data?: any): void {
    this.logs.push({ level: 'warn', msg, data });
  }

  error(msg: string, data?: any): void {
    this.logs.push({ level: 'error', msg, data });
  }

  getLogs(level?: string): any[] {
    return level ? this.logs.filter(l => l.level === level) : this.logs;
  }

  clear(): void {
    this.logs = [];
  }
}

/**
 * Helper: create a canonical Parcel for testing
 */
function createTestParcel(overrides: Partial<Parcel> = {}): Parcel {
  const base: Parcel = {
    id: 'PARCEL-001',
    shipper: {
      contact: {
        name: 'Test Company',
        phone: '+36301111111',
        email: 'sender@test.com',
      },
      address: {
        name: 'Test Company',
        street: '123 Business Avenue',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        phone: '+36301111111',
        email: 'sender@test.com',
      },
    },
    recipient: {
      contact: {
        name: 'John Doe',
        phone: '+36302222222',
        email: 'john@test.com',
      },
      delivery: {
        method: 'HOME',
        address: {
          name: 'John Doe',
          street: '456 Customer Street',
          city: 'Debrecen',
          postalCode: '4024',
          country: 'HU',
          phone: '+36302222222',
          email: 'john@test.com',
        },
      },
    },
    package: {
      weightGrams: 2000,
      dimensionsCm: { length: 30, width: 20, height: 15 },
    },
    service: 'standard',
    references: {
      customerReference: 'ORDER-123',
    },
  };

  return { ...base, ...overrides };
}

describe('MPLAdapter - Parcels (CREATE_PARCEL, CREATE_PARCELS)', () => {
  let adapter: MPLAdapter;
  let httpClient: MockHttpClient;
  let logger: MockLogger;
  let context: AdapterContext;

  beforeEach(() => {
    adapter = new MPLAdapter();
    httpClient = new MockHttpClient();
    logger = new MockLogger();
    context = {
      http: httpClient,
      logger,
      operationName: 'createParcels',
      loggingOptions: {
        silentOperations: [],
        maxArrayItems: 10,
        maxDepth: 3,
      },
    };
  });

  describe('createParcel (single)', () => {
    it('should handle single parcel creation error', async () => {
      const parcel = createTestParcel();

      const error = new Error('Validation error: Missing required field');
      (error as any).status = 400;
      (error as any).response = { status: 400, data: { message: 'Validation error' } };

      httpClient.setError(error);

      const request: CreateParcelRequest = {
        parcel,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
      };

      try {
        await adapter.createParcel!(request, context);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        expect((err as CarrierError).category).toBe('Validation');
      }
    });
  });

  describe('createParcels (batch)', () => {
    it('should enforce batch size limit (100 shipments)', async () => {
      const parcels: Parcel[] = [];
      for (let i = 0; i < 101; i++) {
        parcels.push(
          createTestParcel({
            id: `PARCEL-${String(i + 1).padStart(4, '0')}`,
            references: { customerReference: `ORDER-${i + 1}` },
          })
        );
      }

      const request: CreateParcelsRequest = {
        parcels,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          useTestApi: false,
          accountingCode: 'ACC-00001',
        },
      };

      try {
        await adapter.createParcels!(request, context);
        expect.fail('Should have thrown CarrierError for batch size limit');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        expect((err as CarrierError).category).toBe('Validation');
        expect((err as CarrierError).message).toMatch(/too many|parcels/i);
      }
    });

    it('should handle validation error (400)', async () => {
      const parcel = createTestParcel();

      const error = new Error('Validation error');
      (error as any).status = 400;
      (error as any).response = {
        status: 400,
        data: {
          message: 'Invalid postal code format',
          errorCode: 'INVALID_POSTAL_CODE',
        },
      };

      httpClient.setError(error);

      const request: CreateParcelsRequest = {
        parcels: [parcel],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          useTestApi: false,
          accountingCode: 'ACC-00001',
        },
      };

      try {
        await adapter.createParcels!(request, context);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        expect((err as CarrierError).category).toBe('Validation');
      }
    });

    it('should handle authentication error (401)', async () => {
      const parcel = createTestParcel();

      const error = new Error('Unauthorized');
      (error as any).status = 401;
      (error as any).response = {
        status: 401,
        data: {
          message: 'Invalid API key',
          errorCode: 'INVALID_API_KEY',
        },
      };

      httpClient.setError(error);

      const request: CreateParcelsRequest = {
        parcels: [parcel],
        credentials: {
          authType: 'apiKey',
          apiKey: 'invalid-key',
          apiSecret: 'invalid-secret',
        },
        options: {
          useTestApi: false,
          accountingCode: 'ACC-00001',
        },
      };

      try {
        await adapter.createParcels!(request, context);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        expect((err as CarrierError).category).toBe('Auth');
      }
    });

    it('should handle rate limit error (429)', async () => {
      const parcel = createTestParcel();

      const error = new Error('Too many requests');
      (error as any).status = 429;
      (error as any).response = {
        status: 429,
        data: { message: 'Rate limit exceeded' },
        headers: { 'retry-after': '60' },
      };

      httpClient.setError(error);

      const request: CreateParcelsRequest = {
        parcels: [parcel],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          useTestApi: false,
          accountingCode: 'ACC-00001',
        },
      };

      try {
        await adapter.createParcels!(request, context);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        expect((err as CarrierError).category).toBe('RateLimit');
      }
    });

    it('should handle server error (500) as transient', async () => {
      const parcel = createTestParcel();

      const error = new Error('Internal server error');
      (error as any).status = 500;
      (error as any).response = {
        status: 500,
        data: { message: 'Internal server error' },
      };

      httpClient.setError(error);

      const request: CreateParcelsRequest = {
        parcels: [parcel],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          useTestApi: false,
          accountingCode: 'ACC-00001',
        },
      };

      try {
        await adapter.createParcels!(request, context);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        expect((err as CarrierError).category).toBe('Transient');
      }
    });

    it('should handle network error as transient', async () => {
      const parcel = createTestParcel();

      const error = new Error('Network timeout');
      httpClient.setError(error);

      const request: CreateParcelsRequest = {
        parcels: [parcel],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          useTestApi: false,
          accountingCode: 'ACC-00001',
        },
      };

      try {
        await adapter.createParcels!(request, context);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        expect((err as CarrierError).category).toBe('Transient');
      }
    });

    it('should provide useful error messages', async () => {
      const parcel = createTestParcel();

      const error = new Error('Validation error');
      (error as any).status = 400;
      (error as any).response = {
        status: 400,
        data: {
          message: 'Invalid postal code: must be 4 digits',
          errorCode: 'INVALID_POSTAL_CODE',
        },
      };

      httpClient.setError(error);

      const request: CreateParcelsRequest = {
        parcels: [parcel],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          useTestApi: false,
          accountingCode: 'ACC-00001',
        },
      };

      try {
        await adapter.createParcels!(request, context);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        const carrierError = err as CarrierError;
        expect(carrierError.message).toBeDefined();
        expect(carrierError.category).toBe('Validation');
        expect(carrierError.raw).toBeDefined();
      }
    });
  });
});
