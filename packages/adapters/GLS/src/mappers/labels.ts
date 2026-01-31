/**
 * GLS Label Mapper
 * 
 * Maps between canonical Shopickup types and GLS label request/response types.
 * Handles label creation flow using PrintLabels endpoint which combines:
 * 1. PrepareLabels (create parcel records)
 * 2. GetPrintedLabels (retrieve PDF)
 */

import type {
  CreateLabelsRequest,
  CreateLabelsResponse,
  LabelFileResource,
} from '@shopickup/core';
import type {
  GLSPrintLabelsRequest,
  GLSPrintLabelsResponse,
  GLSPrintLabelsInfo,
  GLSErrorInfo,
  GLSParcel,
} from '../types/index.js';

/**
 * Map canonical Shopickup CreateLabelsRequest to GLS PrintLabelsRequest
 * 
 * The request contains parcel carrier IDs (from a prior CreateParcels call).
 * Since we have only IDs, we create minimal GLS parcel objects with just the ID reference.
 * The GLS API will look up the parcels by clientReference.
 * 
 * IMPORTANT: This assumes parcels were already created via CreateParcels (PrepareLabels).
 * The parcelCarrierIds should be the GLS parcel IDs from that response.
 * 
 * @param req Shopickup CreateLabelsRequest with parcel carrier IDs
 * @param clientNumber GLS client account number
 * @param username GLS username (for auth)
 * @param hashedPassword GLS SHA512-hashed password
 * @param webshopEngine Optional webshop engine identifier
 * @returns GLS PrintLabelsRequest
 */
export function mapCanonicalCreateLabelsToGLSPrintLabels(
  req: CreateLabelsRequest,
  clientNumber: number,
  username: string,
  hashedPassword: number[],
  webshopEngine?: string
): GLSPrintLabelsRequest {
  // Map parcel carrier IDs to GLS parcel list
  // Each ID is used as the clientReference to identify the parcel
  // NOTE: Per GLS API spec, auth fields (username, password, clientNumberList) are NOT part of individual parcels
  const glsParcels: GLSParcel[] = req.parcelCarrierIds.map((parcelCarrierId) => ({
    clientReference: parcelCarrierId, // Use carrier ID as reference
    // Minimal address info - GLS will use existing parcel data
    pickupAddress: {
      name: 'Existing',
      street: 'Existing',
      city: 'Existing',
      zipCode: '00000',
      countryIsoCode: 'HU',
    },
    deliveryAddress: {
      name: 'Existing',
      street: 'Existing',
      city: 'Existing',
      zipCode: '00000',
      countryIsoCode: 'HU',
    },
  }));

   return {
     parcelList: glsParcels,
     username,
     password: hashedPassword,
     clientNumberList: [clientNumber],
     webshopEngine: webshopEngine || 'shopickup-adapter/1.0',
     // Use default printer settings (can be customized in options)
     typeOfPrinter: 'Thermo', // Default thermal printer
   };
}

/**
 * Map GLS PrintLabelsResponse to canonical Shopickup CreateLabelsResponse
 * 
 * The response contains:
 * - labels: PDF bytes (base64 or binary)
 * - printLabelsInfoList: metadata about created labels
 * - printLabelsErrorList: any errors encountered
 * 
 * @param glsResponse GLS PrintLabelsResponse
 * @param requestParcelCount Number of parcels in the original request
 * @returns Shopickup CreateLabelsResponse
 */
export function mapGLSPrintLabelsToCanonicalCreateLabels(
  glsResponse: GLSPrintLabelsResponse,
  requestParcelCount: number
): CreateLabelsResponse {
  const successfulLabels = glsResponse.printLabelsInfoList || [];
  const errors = glsResponse.printLabelsErrorList || [];

  // Convert PDF bytes to Buffer or Uint8Array
  let pdfBuffer: Buffer | Uint8Array | undefined;
  if (glsResponse.labels) {
    if (typeof glsResponse.labels === 'string') {
      // Base64 string - convert to buffer
      try {
        pdfBuffer = Buffer.from(glsResponse.labels, 'base64');
      } catch (e) {
        // If not valid base64, try as-is
        pdfBuffer = Buffer.from(glsResponse.labels, 'utf8');
      }
    } else if (glsResponse.labels instanceof Uint8Array) {
      pdfBuffer = glsResponse.labels;
    } else if (Buffer.isBuffer(glsResponse.labels)) {
      pdfBuffer = glsResponse.labels;
    }
  }

  // Create file metadata for each successful label
  // Typically there's one combined PDF, but we map per-parcel for consistency
  const files: LabelFileResource[] = successfulLabels.map((label, idx) => ({
    id: `gls-label-${label.parcelId}`,
    contentType: 'application/pdf',
    byteLength: pdfBuffer?.length || 0,
    pages: 1, // Default to 1 page per label (actual may vary)
    orientation: 'portrait' as const,
    metadata: {
      glsParcelId: String(label.parcelId),
      clientReference: label.clientReference || '',
      parcelNumber: label.parcelNumber || '',
      pin: label.pin || '',
    },
  }));

  // Map successful labels to results
  const results = successfulLabels.map((label) => ({
    inputId: label.clientReference || String(label.parcelId),
    status: 'created' as const,
    fileId: `gls-label-${label.parcelId}`,
    pageRange: {
      start: 1,
      end: 1,
    },
    carrierId: String(label.parcelId),
    raw: label,
  }));

  // Map errors to failed results
  const failedResults = errors.map((error, idx) => ({
    inputId: `error-${idx}`,
    status: 'failed' as const,
    errorMessage: error.errorDescription,
    errorCode: String(error.errorCode),
    raw: error,
  }));

  const allResults = [...results, ...failedResults];
  const successCount = results.length;
  const failureCount = errors.length;
  const totalCount = allResults.length;

  let summary = `Label generation complete`;
  if (failureCount === 0 && successCount > 0) {
    summary = `All ${successCount} labels generated successfully`;
  } else if (successCount === 0 && failureCount > 0) {
    summary = `All ${failureCount} labels failed`;
  } else if (successCount > 0 && failureCount > 0) {
    summary = `Mixed results: ${successCount} succeeded, ${failureCount} failed`;
  }

  return {
    files: files.length > 0 ? files : undefined,
    results: allResults,
    successCount,
    failureCount,
    totalCount,
    allSucceeded: failureCount === 0 && successCount > 0,
    allFailed: successCount === 0 && failureCount > 0,
    someFailed: successCount > 0 && failureCount > 0,
    summary,
    rawCarrierResponse: pdfBuffer, // Return PDF bytes for integrator to store/upload
  };
}

/**
 * Map GLS ErrorInfo to a simple error object for logging
 * 
 * @param error GLS ErrorInfo
 * @returns Serializable error object
 */
export function mapGLSErrorInfoToObject(error: GLSErrorInfo): any {
  return {
    errorCode: error.errorCode,
    errorDescription: error.errorDescription,
    clientReferenceList: error.clientReferenceList || [],
    parcelIdList: error.parcelIdList || [],
  };
}
