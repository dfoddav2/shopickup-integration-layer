import { createAxiosHttpClient } from '@shopickup/core';
import type { Logger, HttpClient } from '@shopickup/core';

/**
 * Mock HTTP Client for testing without real carrier credentials
 * Returns realistic-looking mock responses for Foxpost API calls
 * 
 * Special behavior:
 * - APM parcels with invalid pickup point IDs return validation errors
 * - This simulates real Foxpost API behavior
 */
class MockHttpClient implements HttpClient {
  async post<T>(url: string, data?: any, options?: any): Promise<T> {
    // Mock parcel creation response
    if (url.includes("/api/parcel")) {
      const requestArray = Array.isArray(data) ? data : [data];
      
      // Check if any parcel is APM type with invalid pickup point
      // In real scenario: pickup point IDs must be valid Foxpost APM locations
      // APM parcels have a 'destination' field set, HD parcels don't
      const hasInvalidApm = requestArray.some((p: any) => 
        p?.destination === "bp-01" // bp-01 is invalid in mock
      );

      if (hasInvalidApm) {
        // Return Foxpost's error response format: HTTP 200 with valid=false
        return {
          valid: false,
          parcels: requestArray.map((parcel: any, idx: number) => {
            const hasInvalidDestination = parcel?.sendType === "APM" && parcel?.destination === "bp-01";
            
            return {
              recipientName: parcel?.recipientName,
              recipientPhone: parcel?.recipientPhone,
              recipientEmail: parcel?.recipientEmail,
              size: parcel?.size,
              recipientCountry: hasInvalidDestination ? null : parcel?.recipientCountry,
              recipientCity: hasInvalidDestination ? null : parcel?.recipientCity,
              recipientZip: hasInvalidDestination ? null : parcel?.recipientZip,
              recipientAddress: hasInvalidDestination ? null : parcel?.recipientAddress,
              cod: 0,
              deliveryNote: null,
              comment: null,
              label: null,
              fragile: parcel?.fragile ?? false,
              uniqueBarcode: null,
              refCode: parcel?.refCode,
              voucher: null,
              clFoxId: hasInvalidDestination ? null : `CLFOX${String(idx + 1).padStart(12, '0')}`,
              validTo: "2026-03-23 12:58",
              orderId: hasInvalidDestination ? null : 12517 + idx,
              barcode: null,
              sendCode: hasInvalidDestination ? null : 7175527 + idx,
              barcodeTof: hasInvalidDestination ? null : `501397${String(7175527 + idx).padStart(9, '0')}000013604024`,
              sendType: parcel?.sendType,
              parcelType: "NORMAL",
              partnerType: "B2C",
              routeInfo: hasInvalidDestination ? null : {
                routeNumber: "1",
                countryCode: "HU",
                labelSubType: "H24",
                depoCode: "DE1",
                destinationApm: null
              },
              errors: hasInvalidDestination ? [
                {
                  field: "destination",
                  message: "INVALID_APM_ID"
                }
              ] : null,
              source: null,
              destination: parcel?.destination
            };
          }),
          errors: null,
        } as unknown as T;
      }

      // Success case - all parcels valid
      const parcels = requestArray.map((parcel: any, idx: number) => ({
        recipientName: parcel?.recipientName,
        recipientPhone: parcel?.recipientPhone,
        recipientEmail: parcel?.recipientEmail,
        size: parcel?.size,
        recipientCountry: parcel?.recipientCountry,
        recipientCity: parcel?.recipientCity,
        recipientZip: parcel?.recipientZip,
        recipientAddress: parcel?.recipientAddress,
        cod: 0,
        deliveryNote: null,
        comment: null,
        label: null,
        fragile: parcel?.fragile ?? false,
        uniqueBarcode: null,
        refCode: parcel?.refCode,
        voucher: null,
        clFoxId: `CLFOX${String(idx + 1).padStart(12, '0')}`,
        validTo: "2026-03-23 12:58",
        orderId: 12517 + idx,
        barcode: null,
        sendCode: 7175527 + idx,
        barcodeTof: `501397${String(7175527 + idx).padStart(9, '0')}000013604024`,
        sendType: parcel?.sendType || "HD",
        parcelType: "NORMAL",
        partnerType: "B2C",
        routeInfo: {
          routeNumber: "1",
          countryCode: "HU",
          labelSubType: "H24",
          depoCode: "DE1",
          destinationApm: null
        },
        errors: null,
        source: null,
        destination: parcel?.destination || "1477"
      }));
      return {
        valid: true,
        parcels,
      } as unknown as T;
    }
    throw new Error(`Mock: Unexpected POST: ${url}`);
  }

  async get<T>(url: string, options?: any): Promise<T> {
    throw new Error(`Mock: Unexpected GET: ${url}`);
  }

  async put<T>(url: string, data?: any, options?: any): Promise<T> {
    throw new Error(`Mock: Unexpected PUT: ${url}`);
  }

  async patch<T>(url: string, data?: any, options?: any): Promise<T> {
    throw new Error(`Mock: Unexpected PATCH: ${url}`);
  }

  async delete<T>(url: string, options?: any): Promise<T> {
    throw new Error(`Mock: Unexpected DELETE: ${url}`);
  }
}

/**
 * Wrapper to convert Fastify's Pino logger to our Logger interface.
 * Pino requires metadata to be in the first parameter as {msg: '...', ...fields},
 * but our Logger interface expects (message, meta) format.
 * This wrapper converts between the two.
 * 
 * @param pinoLogger - The Pino logger instance from Fastify
 * @returns A Logger instance compatible with AdapterContext
 */
export function wrapPinoLogger(pinoLogger: any): Logger {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => {
      pinoLogger.debug({ msg: message, ...meta });
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      pinoLogger.info({ msg: message, ...meta });
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      pinoLogger.warn({ msg: message, ...meta });
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      pinoLogger.error({ msg: message, ...meta });
    },
  };
}

// Factory to create a pre-configured HttpClient bound to a provided logger.
// Call this after Fastify is created so the client's debug logs route through Fastify's logger.
export function makeHttpClient(logger?: Logger) {
  // Use mock HTTP client for testing if environment variable is set
  if (process.env.USE_MOCK_HTTP_CLIENT === '1') {
    return new MockHttpClient();
  }

  return createAxiosHttpClient({
    defaultTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS) || 15000,
    debug: process.env.HTTP_DEBUG === '1',
    debugFullBody: process.env.HTTP_DEBUG_FULL === '1',
    logger: logger ? wrapPinoLogger(logger) : undefined,
  });
}
