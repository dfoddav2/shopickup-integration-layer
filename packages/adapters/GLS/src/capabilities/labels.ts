/**
 * GLS Label Creation Capability
 * 
 * Creates labels and retrieves PDF files using GLS MyGLS API PrintLabels endpoint.
 * 
 * IMPORTANT: This is HU-specific implementation.
 */

import type {
  AdapterContext,
  CreateLabelsResponse,
} from '@shopickup/core';
import {
  CarrierError,
  safeLog,
  serializeForLog,
  errorToLog,
} from '@shopickup/core';
import {
  hashPasswordSHA512,
  createGLSAuthHeader,
  resolveGLSBaseUrl,
  validateGLSCredentials,
} from '../utils/authentication.js';

/**
 * Create a single label
 * Delegates to createLabels for batch processing
 */
export async function createLabel(
  req: any, // CreateLabelRequest type
  ctx: AdapterContext,
  createLabelsImpl: (req: any, ctx: AdapterContext) => Promise<any>
): Promise<any> {
  // Import validators
  const { safeValidateCreateLabelsRequest } = await import('../validation/labels.js');
  
  // Create batch request with single parcel ID
  const batchReq = {
    parcelCarrierIds: [req.parcelCarrierId],
    credentials: req.credentials,
    options: req.options,
  };

  const response = await createLabelsImpl(batchReq, ctx);

  // Return first result or throw if empty
  if (!response || !Array.isArray(response.results) || response.results.length === 0) {
    throw new CarrierError(
      'createLabels returned empty results',
      'Transient',
      { raw: serializeForLog(response) as any }
    );
  }

  const result = response.results[0];
  return {
    ...result,
    rawCarrierResponse: response.rawCarrierResponse,
  };
}

/**
 * Create multiple labels in batch
 * 
 * Maps canonical CreateLabelsRequest to GLS PrintLabels request and retrieves PDF labels.
 * The parcelCarrierIds should be GLS parcel IDs from a prior CreateParcels call.
 * 
 * Returns PDF bytes in rawCarrierResponse for integrator to store/upload.
 * Per-label metadata is in files array.
 * 
 * IMPORTANT: This is HU-specific implementation.
 * 
 * @param req CreateLabelsRequest with parcel carrier IDs
 * @param ctx Adapter context with HTTP client
 * @returns CreateLabelsResponse with file metadata and PDF bytes
 */
export async function createLabels(
  req: any, // CreateLabelsRequest type
  ctx: AdapterContext
): Promise<CreateLabelsResponse> {
  try {
    // Import mappers and validators
    const { safeValidateCreateLabelsRequest } = await import('../validation/labels.js');
    const {
      mapCanonicalCreateLabelsToGLSPrintLabels,
      mapGLSPrintLabelsToCanonicalCreateLabels,
    } = await import('../mappers/labels.js');

    // Validate request
    const validated = safeValidateCreateLabelsRequest(req);
    if (!validated.success) {
      throw new CarrierError(
        `Invalid request: ${validated.error?.message}`,
        'Validation',
        { raw: validated.error }
      );
    }

    if (!ctx.http) {
      throw new CarrierError(
        'HTTP client not provided in context',
        'Permanent'
      );
    }

    if (!Array.isArray(req.parcelCarrierIds) || req.parcelCarrierIds.length === 0) {
      return {
        results: [],
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        allSucceeded: false,
        allFailed: false,
        someFailed: false,
        summary: 'No parcel IDs provided',
      };
    }

    // Extract country and test mode from options
    const country = (req.options?.country as string) || 'HU';
    const useTestApi = (req.options?.useTestApi as boolean) || false;

    // Resolve GLS base URL
    const baseUrl = resolveGLSBaseUrl(country, useTestApi);

    // Extract and validate credentials
    const credentials = req.credentials as any;
    validateGLSCredentials({
      username: credentials.username,
      password: credentials.password,
      clientNumberList: credentials.clientNumberList,
    });

    // Hash the password
    const hashedPassword = hashPasswordSHA512(credentials.password);

    // Get first client number
    const clientNumber = credentials.clientNumberList[0];

    // Map canonical request to GLS PrintLabels request
    const glsRequest = mapCanonicalCreateLabelsToGLSPrintLabels(
      req,
      clientNumber,
      credentials.username,
      hashedPassword,
      credentials.webshopEngine
    );

    const authHeaders = createGLSAuthHeader(credentials.username, hashedPassword);

    safeLog(
      ctx.logger,
      'debug',
      'GLS: Creating labels batch',
      {
        count: req.parcelCarrierIds.length,
        country,
        testMode: useTestApi,
      },
      ctx,
      ['createLabels']
    );

    // Call GLS PrintLabels endpoint (combines PrepareLabels + GetPrintedLabels)
    const httpResponse = await ctx.http.post(
      `${baseUrl}/json/PrintLabels`,
      glsRequest,
      { headers: authHeaders }
    );

    // Extract body from response
    const carrierRespBody = httpResponse.body as any;

    // Validate the response
    const { safeValidateGLSPrintLabelsResponse } = await import('../validation/labels.js');
    const responseValidation = safeValidateGLSPrintLabelsResponse(carrierRespBody);
    if (!responseValidation.success) {
      safeLog(
        ctx.logger,
        'warn',
        'GLS: Label response validation failed',
        {
          error: responseValidation.error?.message,
        },
        ctx,
        ['createLabels']
      );
      // Continue anyway - be lenient with response shape
    }

    if (!carrierRespBody) {
      throw new CarrierError('Invalid response from GLS', 'Transient', {
        raw: serializeForLog(httpResponse) as any,
      });
    }

    // Check for API-level errors
    // GLS API returns both printLabelsErrorList and PrintLabelsErrorList (case varies)
    const labelErrorList = (carrierRespBody.printLabelsErrorList || (carrierRespBody as any).PrintLabelsErrorList) as any[];
    if (labelErrorList && labelErrorList.length > 0) {
      const firstError = labelErrorList[0];
      const errorCode = firstError.errorCode || firstError.ErrorCode;
      const errorDescription = firstError.errorDescription || firstError.ErrorDescription;
      
      // Determine error category based on error code
      let category: 'Auth' | 'Validation' | 'Permanent' | 'Transient' = 'Validation';
      if (errorCode === -1) {
        category = 'Auth';
      } else if (errorCode === 14 || errorCode === 15 || errorCode === 27) {
        category = 'Auth';
      } else if (errorCode >= 1000) {
        category = 'Permanent';
      }
      
      throw new CarrierError(
        `GLS API error: ${errorDescription} (code: ${errorCode})`,
        category,
        {
          carrierCode: errorCode.toString(),
          raw: serializeForLog(firstError) as any,
        }
      );
    }

    // Map response to canonical format
    const response = mapGLSPrintLabelsToCanonicalCreateLabels(
      carrierRespBody,
      req.parcelCarrierIds.length
    );

    safeLog(
      ctx.logger,
      'info',
      'GLS: Labels creation finished',
      {
        count: response.results.length,
        testMode: useTestApi,
        summary: response.summary,
        successCount: response.successCount,
        failureCount: response.failureCount,
      },
      ctx,
      ['createLabels']
    );

    return response;
  } catch (error) {
    safeLog(
      ctx.logger,
      'error',
      'GLS: Error creating labels batch',
      {
        error: errorToLog(error),
      },
      ctx,
      ['createLabels']
    );

    if (error instanceof CarrierError) {
      throw error;
    }

    // Translate unknown errors
    if ((error as any).response?.status === 401 || (error as any).response?.status === 403) {
      throw new CarrierError('GLS authentication failed', 'Permanent', { raw: error });
    }

    throw new CarrierError(
      `GLS error: ${error instanceof Error ? error.message : String(error)}`,
      'Transient',
      { raw: error }
    );
  }
}
