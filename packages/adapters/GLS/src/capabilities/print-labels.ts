/**
 * GLS PrintLabels Capability (One-Step)
 * 
 * Creates labels and retrieves PDF files in one call using GLS MyGLS API PrintLabels endpoint.
 * PrintLabels internally performs PrepareLabels + GetPrintedLabels in a single API call.
 * 
 * IMPORTANT: This is HU-specific implementation.
 */

import type {
  AdapterContext,
  CreateLabelResponse,
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
  GLSPrintLabelRequestSchema,
  GLSPrintLabelsRequestSchema,
  type GLSPrintLabelRequest,
  type GLSPrintLabelsRequest,
  safeValidateGLSPrintLabelsResponse,
} from '../validation/labels.js';
import {
  mapCanonicalCreateLabelsToGLSPrintLabels,
  mapGLSPrintLabelsToCanonicalCreateLabels,
} from '../mappers/labels.js';

/**
 * Create a single label (one-step)
 * Delegates to printLabels with a single full parcel payload
 */
export async function printLabel(
  req: GLSPrintLabelRequest,
  ctx: AdapterContext,
  printLabelsImpl: (req: GLSPrintLabelsRequest, ctx: AdapterContext) => Promise<CreateLabelsResponse>
): Promise<CreateLabelResponse> {
  const parsed = GLSPrintLabelRequestSchema.safeParse(req);
  if (!parsed.success) {
    throw new CarrierError(
      `Invalid request: ${parsed.error.message}`,
      'Validation',
      { raw: serializeForLog(parsed.error.issues) as any }
    );
  }

  // Create batch request with a single full parcel payload
  const batchReq = {
    parcels: [parsed.data.parcel],
    credentials: parsed.data.credentials,
    options: parsed.data.options,
  };

  const response = await printLabelsImpl(batchReq, ctx);

  // Return first result or throw if empty
  if (!response || !Array.isArray(response.results) || response.results.length === 0) {
    throw new CarrierError('printLabels returned empty results', 'Transient', { raw: serializeForLog(response) as any });
  }

  const result = response.results[0]!;
  if (result.status === 'failed') {
    const firstError = result.errors?.[0];
    const rawCategory = (result.raw as any)?.category as string | undefined;
    const category = rawCategory === 'Auth' || (firstError?.code && ['27', '14', '15', '-1'].includes(String(firstError.code)))
      ? 'Auth'
      : (rawCategory === 'NotFound' ? 'NotFound' : 'Validation');

    throw new CarrierError(
      firstError?.message || 'Label creation failed',
      category,
      {
        carrierCode: firstError?.code,
        raw: serializeForLog({ result, rawCarrierResponse: response.rawCarrierResponse }) as any,
      }
    );
  }

  const file = result.fileId
    ? response.files?.find((candidate) => candidate.id === result.fileId)
    : undefined;

  return {
    ...result,
    file,
    rawCarrierResponse: response.rawCarrierResponse,
  };
}

/**
 * Create multiple labels in one step (one-step flow)
 * 
 * Maps canonical parcel payloads directly to GLS PrintLabels request and retrieves PDF labels.
 * This mirrors the GLS PrintLabels endpoint contract (PrepareLabels + GetPrintedLabels in one call).
 * 
 * Returns PDF bytes in rawCarrierResponse for integrator to store/upload.
 * Per-label metadata is in files array.
 * 
 * IMPORTANT: This is HU-specific implementation.
 * 
 * @param req Request with canonical parcels to print
 * @param ctx Adapter context with HTTP client
 * @returns CreateLabelsResponse with file metadata and PDF bytes
 */
export async function printLabels(
  req: GLSPrintLabelsRequest,
  ctx: AdapterContext
): Promise<CreateLabelsResponse> {
  try {
    // Validate request using Zod schema
    const parsed = GLSPrintLabelsRequestSchema.safeParse(req);
    if (!parsed.success) {
      throw new CarrierError(
        `Invalid request: ${parsed.error.message}`,
        'Validation',
        { raw: parsed.error.issues }
      );
    }
    const validated = parsed.data;

    if (!ctx.http) {
      throw new CarrierError(
        'HTTP client not provided in context',
        'Permanent'
      );
    }

    if (!Array.isArray(validated.parcels) || validated.parcels.length === 0) {
      return {
        results: [],
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        allSucceeded: false,
        allFailed: false,
        someFailed: false,
        summary: 'No parcels provided',
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

    // Map canonical request to GLS PrintLabels request
    // Password is now a byte array included in JSON body
    const glsRequestCamelCase = mapCanonicalCreateLabelsToGLSPrintLabels(
      validated,
      clientNumber,
      credentials.username,
      hashedPassword,
      credentials.webshopEngine,
      validated.options?.gls?.printerType,
      validated.options?.gls?.printPosition,
      validated.options?.gls?.showPrintDialog,
    );

    // Convert to PascalCase (matching PHP example)
    const glsRequest = convertToPascalCase(glsRequestCamelCase);

    safeLog(
      ctx.logger,
      'debug',
        'GLS: Creating labels batch (PrintLabels endpoint)',
        {
        count: validated.parcels.length,
        country,
        testMode: useTestApi,
        requestKeys: Object.keys(glsRequest),
      },
      ctx,
      ['printLabels']
    );

    // Call GLS PrintLabels endpoint (combines PrepareLabels + GetPrintedLabels)
    // No HTTP Basic Auth header needed - password is in JSON body as byte array
    const httpResponse = await ctx.http.post(
      `${baseUrl}/json/PrintLabels`,
      glsRequest
    );

    // Log response for debugging
    safeLog(
      ctx.logger,
      'debug',
      'GLS: PrintLabels response received',
      {
        statusCode: (httpResponse as any).statusCode || 'unknown',
        hasBody: !!httpResponse.body,
        bodyKeys: httpResponse.body ? Object.keys(httpResponse.body).slice(0, 5) : [],
      },
      ctx,
      ['printLabels', 'debug']
    );

    // Extract body from response
    const carrierRespBody = httpResponse.body as any;

    // Validate the response
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
        ['printLabels']
      );
      // Continue anyway - be lenient with response shape
    }

    if (!carrierRespBody) {
      throw new CarrierError('Invalid response from GLS', 'Transient', {
        raw: serializeForLog(httpResponse) as any,
      });
    }

    // Map response to canonical format
    const response = mapGLSPrintLabelsToCanonicalCreateLabels(
      carrierRespBody,
      validated.parcels.length
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
      ['printLabels']
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
      ['printLabels']
    );

    if (error instanceof CarrierError) {
      throw error;
    }

    // Translate unknown errors
    if ((error as any).response?.status === 401 || (error as any).response?.status === 403) {
      throw new CarrierError('GLS authentication failed', 'Auth', { raw: error });
    }

    throw new CarrierError(
      `GLS error: ${error instanceof Error ? error.message : String(error)}`,
      'Transient',
      { raw: error }
    );
  }
}
