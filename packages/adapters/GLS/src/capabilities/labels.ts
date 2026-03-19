/**
 * GLS GetPrintedLabels Capability (Two-Step)
 * 
 * Retrieves PDF labels for existing parcels using GLS MyGLS API GetPrintedLabels endpoint.
 * This is the standard two-step flow:
 * 1. CreateParcels (PrepareLabels) - creates parcel records in GLS system
 * 2. GetPrintedLabels - retrieves printable PDF labels for those parcels by ID
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
  resolveGLSBaseUrl,
  validateGLSCredentials,
  convertToPascalCase,
} from '../utils/authentication.js';
import {
  safeValidateGetPrintedLabelsRequest,
  safeValidateGLSGetPrintedLabelsResponse,
  GLSCreateLabelsRequestSchema,
  GLSCreateLabelsRequest,
  GLSCreateLabelRequest,
  GLSCreateLabelRequestSchema,
} from '../validation/labels.js';
import {
  mapCanonicalCreateLabelsToGLSGetPrintedLabels,
  mapGLSGetPrintedLabelsToCanonicalCreateLabels,
} from '../mappers/labels.js';

/**
 * Create a single label (two-step)
 * Delegates to createLabels for batch processing
 */
export async function createLabel(
  req: GLSCreateLabelRequest,
  ctx: AdapterContext,
  createLabelsImpl: (req: GLSCreateLabelsRequest, ctx: AdapterContext) => Promise<CreateLabelsResponse>
): Promise<CreateLabelsResponse> {
  // Build typed batch request from singular
  const batchReq = {
    parcelCarrierIds: [req.parcelCarrierId],
    credentials: req.credentials,
    options: req.options,
  };

  const parsed = GLSCreateLabelsRequestSchema.safeParse(batchReq);
  if (!parsed.success) {
    throw new CarrierError(
      `Invalid request: ${parsed.error.message}`,
      'Validation',
      { raw: serializeForLog(parsed.error.issues) }
    );
  }

  const response = await createLabelsImpl(parsed.data, ctx);

  if (!response || !Array.isArray(response.results) || response.results.length === 0) {
    throw new CarrierError('createLabels returned empty results', 'Transient', { raw: serializeForLog(response) as any });
  }

  // Return the whole CreateLabelsResponse but with singular semantics callers expect
  return response;
}

/**
 * Create multiple labels in batch (two-step flow)
 * 
 * Retrieves printable PDF labels for parcel IDs using GLS GetPrintedLabels endpoint.
 * Assumes parcels were already created via createParcels (PrepareLabels endpoint).
 * The parcelCarrierIds should be the GLS parcel IDs from that response.
 * 
 * Returns PDF bytes in rawCarrierResponse for integrator to store/upload.
 * Per-label metadata is in files array.
 * 
 * IMPORTANT: This is HU-specific implementation.
 * 
 * @param req CreateLabelsRequest with parcel carrier IDs (from createParcels)
 * @param ctx Adapter context with HTTP client
 * @returns CreateLabelsResponse with file metadata and PDF bytes
 */
export async function createLabels(
  req: GLSCreateLabelsRequest,
  ctx: AdapterContext
): Promise<CreateLabelsResponse> {
  try {
    // Validate canonical request format using Zod schema
    const parsed = GLSCreateLabelsRequestSchema.safeParse(req);
    if (!parsed.success) {
      throw new CarrierError(
        `Invalid request: ${parsed.error.message}`,
        'Validation',
        { raw: parsed.error.flatten() }
      );
    }
    const validated = parsed.data;

    if (!ctx.http) {
      throw new CarrierError(
        'HTTP client not provided in context',
        'Permanent'
      );
    }

    if (!Array.isArray(validated.parcelCarrierIds) || validated.parcelCarrierIds.length === 0) {
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
    const country = (validated.options?.gls?.country as string) || 'HU';
    const useTestApi = (validated.options?.useTestApi as boolean) || false;

    // Resolve GLS base URL
    const baseUrl = resolveGLSBaseUrl(country, useTestApi);

    // Extract and validate credentials
    const credentials = validated.credentials as any;
    validateGLSCredentials({
      username: credentials.username,
      password: credentials.password,
      clientNumberList: credentials.clientNumberList,
    });

    // Hash the password
    const hashedPassword = hashPasswordSHA512(credentials.password);

    // Get first client number
    const clientNumber = credentials.clientNumberList[0];

    // Map canonical request to GLS GetPrintedLabels request
    // Password is now a byte array included in JSON body
    const glsRequestCamelCase = mapCanonicalCreateLabelsToGLSGetPrintedLabels(
      validated,
      clientNumber,
      credentials.username,
      hashedPassword,
      (validated.options?.gls?.printerType as string)
    );

    // Convert to PascalCase (matching PHP example)
    const glsRequest = convertToPascalCase(glsRequestCamelCase);

    safeLog(
      ctx.logger,
      'debug',
      'GLS: Retrieving labels (GetPrintedLabels endpoint)',
      {
        count: validated.parcelCarrierIds.length,
        country,
        testMode: useTestApi,
        requestKeys: Object.keys(glsRequest),
      },
      ctx,
      ['createLabels']
    );

    // Call GLS GetPrintedLabels endpoint
    // No HTTP Basic Auth header needed - password is in JSON body as byte array
    const httpResponse = await ctx.http.post(
      `${baseUrl}/json/GetPrintedLabels`,
      glsRequest
    );

    // Log response for debugging
    safeLog(
      ctx.logger,
      'debug',
      'GLS: GetPrintedLabels response received',
      {
        statusCode: (httpResponse as any).statusCode || 'unknown',
        hasBody: !!httpResponse.body,
        bodyKeys: httpResponse.body ? Object.keys(httpResponse.body).slice(0, 5) : [],
      },
      ctx,
      ['createLabels', 'debug']
    );

    // Extract body from response
    const carrierRespBody = httpResponse.body as any;

    // Validate the response
    const responseValidation = safeValidateGLSGetPrintedLabelsResponse(carrierRespBody);
    if (!responseValidation.success) {
      safeLog(
        ctx.logger,
        'warn',
        'GLS: Label response validation failed',
        {
          error: responseValidation.error?.message,
          responseKeys: carrierRespBody ? Object.keys(carrierRespBody) : [],
        },
        ctx,
        ['createLabels']
      );
      // Continue anyway - be lenient with response shape
    }

    // Log response structure for debugging
    safeLog(
      ctx.logger,
      'debug',
      'GLS: GetPrintedLabels response structure',
      {
        hasLabels: !!(carrierRespBody?.labels || (carrierRespBody as any)?.Labels),
        hasPdfSize: (carrierRespBody?.labels || (carrierRespBody as any)?.Labels)?.length || 0,
        infoListCount: (carrierRespBody?.printDataInfoList || (carrierRespBody as any)?.PrintDataInfoList)?.length || 0,
        errorListCount: (carrierRespBody?.getPrintedLabelsErrorList || (carrierRespBody as any)?.GetPrintedLabelsErrorList)?.length || 0,
      },
      ctx,
      ['createLabels', 'debug']
    );

    if (!carrierRespBody) {
      throw new CarrierError('Invalid response from GLS', 'Transient', {
        raw: serializeForLog(httpResponse) as any,
      });
    }

    // Check for API-level errors
    // GLS API returns both getPrintedLabelsErrorList and GetPrintedLabelsErrorList (case varies)
    const labelErrorList = (carrierRespBody.getPrintedLabelsErrorList || (carrierRespBody as any).GetPrintedLabelsErrorList) as any[];
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
          raw: serializeForLog(carrierRespBody) as any,
        }
      );
    }

    // Map response to canonical format
    const response = mapGLSGetPrintedLabelsToCanonicalCreateLabels(
      carrierRespBody,
      validated.parcelCarrierIds.length
    );

    safeLog(
      ctx.logger,
      'info',
      'GLS: Labels retrieval finished',
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
      'GLS: Error retrieving labels batch',
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
