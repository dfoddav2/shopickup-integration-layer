/**
 * MPL Adapter: Get Shipment Details Capability
 * Handles GET_SHIPMENT_DETAILS operation via GET /shipments/{trackingNumber}
 * 
 * Retrieves shipment metadata including sender, recipient, items, and shipment state.
 * Note: This returns shipment details/metadata, not tracking event history.
 */

import type { AdapterContext } from '@shopickup/core';
import { CarrierError, serializeForLog, errorToLog } from '@shopickup/core';
import { safeValidateGetShipmentDetailsRequest, safeValidateShipmentQueryResponse } from '../validation.js';
import { buildMPLHeaders } from '../utils/httpUtils.js';
import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';

/**
 * Response type for GET_SHIPMENT_DETAILS operation
 * Contains normalized shipment metadata from MPL API
 */
export interface ShipmentDetailsResponse {
  /** Tracking/shipment number */
  trackingNumber?: string;
  /** Order ID if applicable */
  orderId?: string;
  /** Shipment date if available */
  shipmentDate?: string;
  /** Sender details */
  sender?: {
    name?: string;
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
  };
  /** Recipient details */
  recipient?: {
    name?: string;
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
  };
  /** Items in shipment */
  items?: Array<{
    id?: string;
    weight?: number;
    [key: string]: any;
  }>;
  /** Full raw response from MPL API */
  raw: any;
}

/**
 * Get shipment details by tracking number via GET /shipments/{trackingNumber}
 * 
 * Returns shipment metadata (sender, recipient, items, dates).
 * This is NOT a tracking operation - it retrieves shipment state and details.
 * 
 * To use test API, pass in request with options.useTestApi = true
 */
export async function getShipmentDetails(
  req: {
    trackingNumber: string;
    credentials?: any;
    options?: { useTestApi?: boolean };
  },
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<ShipmentDetailsResponse> {
  try {
    // Validate request format and credentials
    const validated = safeValidateGetShipmentDetailsRequest(req);
    if (!validated.success) {
      throw new CarrierError(
        `Invalid request: ${validated.error.message}`,
        'Validation',
        { raw: serializeForLog(validated.error) as any }
      );
    }

    if (!ctx.http) {
      throw new CarrierError(
        'HTTP client not provided in context',
        'Permanent'
      );
    }

    // Extract accountingCode from credentials (required for MPL)
    const accountingCode = (validated.data.credentials as any)?.accountingCode;
    if (!accountingCode) {
      throw new CarrierError(
        'accountingCode is required in credentials',
        'Validation'
      );
    }

    // Extract useTestApi from validated request
    const useTestApi = validated.data.options?.useTestApi ?? false;
    const baseUrl = resolveBaseUrl(validated.data.options);
    const trackingNumber = validated.data.trackingNumber;

    ctx.logger?.debug('MPL: Getting shipment details', {
      trackingNumber,
      testMode: useTestApi,
    });

    // Get shipment details via GET /shipments/{trackingNumber} endpoint
    const url = `${baseUrl}/shipments/${encodeURIComponent(trackingNumber)}`;
    const httpResponse = await ctx.http.get(url, {
      headers: buildMPLHeaders(validated.data.credentials, accountingCode),
    });

    // Extract body from normalized HttpResponse
    const response = httpResponse.body as any;

    // Validate response against Zod schema
    const responseValidation = safeValidateShipmentQueryResponse(response);
    if (!responseValidation.success) {
      throw new CarrierError(
        `Invalid shipment response: ${responseValidation.error.message}`,
        'Validation',
        { raw: serializeForLog(responseValidation.error) as any }
      );
    }

    const validatedResponse = responseValidation.data;

    // Check for errors in response
    if (validatedResponse.errors && validatedResponse.errors.length > 0) {
      const errorMsg = validatedResponse.errors
        .map((e: any) => e.text || e.code)
        .join('; ');
      throw new CarrierError(
        `MPL error: ${errorMsg}`,
        'Validation',
        { raw: validatedResponse.errors }
      );
    }

    if (!validatedResponse.shipment) {
      throw new CarrierError(
        `No shipment found for tracking number ${trackingNumber}`,
        'Validation'
      );
    }

    const shipment = validatedResponse.shipment;

    ctx.logger?.info('MPL: Shipment details retrieved', {
      trackingNumber,
      itemCount: shipment.items?.length || 0,
      testMode: useTestApi,
    });

    // Return shipment details normalized to response type
    return {
      trackingNumber: shipment.trackingNumber,
      orderId: shipment.orderId,
      shipmentDate: shipment.shipmentDate,
      sender: shipment.sender,
      recipient: shipment.recipient,
      items: shipment.items,
      raw: validatedResponse,
    };
  } catch (error) {
    if (error instanceof CarrierError) {
      throw error;
    }
    ctx.logger?.error('MPL: Error getting shipment details', {
      trackingNumber: req.trackingNumber,
      error: errorToLog(error),
    });
    throw new CarrierError(
      `Failed to get shipment details: ${(error as any)?.message || "Unknown error"}`,
      "Transient",
      { raw: serializeForLog(error) as any }
    );
  }
}
