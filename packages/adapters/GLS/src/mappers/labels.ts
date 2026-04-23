/**
 * GLS Label Mapper
 * 
 * Maps between canonical Shopickup types and GLS label request/response types.
 * Handles label creation flow using PrintLabels endpoint which combines:
 * 1. PrepareLabels (create parcel records)
 * 2. GetPrintedLabels (retrieve PDF)
 */

import { randomUUID, randomBytes } from 'crypto';
import type {
  CreateLabelsRequest,
  CreateLabelsResponse,
  LabelFileResource,
  Parcel,
} from '@shopickup/core';
import { serializeForLog } from '@shopickup/core';
import type {
  GLSPrintLabelsRequest,
  GLSPrintLabelsResponse,
  GLSPrintLabelsInfo,
  GLSGetPrintDataRequest,
  GLSGetPrintDataResponse,
  GLSGetPrintedLabelsRequest,
  GLSGetPrintedLabelsResponse,
  GLSErrorInfo,
  GLSParcel,
} from '../types/index.js';
import { mapCanonicalParcelToGLS } from './parcels.js';

function mapGLSErrorCategory(errorCode: number | string | undefined): 'Validation' | 'Auth' | 'Permanent' | 'Transient' | 'NotFound' {
  const code = typeof errorCode === 'string' ? Number(errorCode) : errorCode;
  if (code === -1 || code === 14 || code === 15 || code === 27) return 'Auth';
  if (code === 4 || code === 9 || code === 26) return 'NotFound';
  if (typeof code === 'number' && code >= 1000) return 'Permanent';
  return 'Validation';
}

/**
 * Generate a UUID v4 for unique file identification.
 * 
 * Uses native randomUUID if available (Node >= 14.17), falls back to
 * crypto.randomBytes for older Node versions.
 * 
 * @returns UUID v4 string in format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
function generateFileUuid(): string {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  
  // Fallback for older Node versions: generate RFC4122 v4 UUID
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 1
  return [...b]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

function isZplPrinterType(printerType?: string): boolean {
  return !!printerType && /ZPL/i.test(printerType);
}

function resolveLabelFormat(printerType?: string): 'PDF' | 'ZPL' {
  return isZplPrinterType(printerType) ? 'ZPL' : 'PDF';
}

function resolveLabelContentType(printerType?: string): 'application/pdf' | 'application/x-zpl' {
  return resolveLabelFormat(printerType) === 'ZPL' ? 'application/x-zpl' : 'application/pdf';
}

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
  req: { parcels: Parcel[] },
  clientNumber: number,
  username: string,
  hashedPassword: number[],
  webshopEngine?: string,
  typeOfPrinter?: GLSPrintLabelsRequest['typeOfPrinter'],
  printPosition?: GLSPrintLabelsRequest['printPosition'],
  showPrintDialog?: boolean
): GLSPrintLabelsRequest {
  const glsParcels = req.parcels.map((parcel) =>
    mapCanonicalParcelToGLS(parcel, clientNumber, parcel.cod?.amount.amount, parcel.cod?.amount.currency)
  );

   return {
     parcelList: glsParcels,
     username,
     password: hashedPassword,
     clientNumberList: [clientNumber],
     webshopEngine: webshopEngine || 'shopickup-adapter/1.0',
      typeOfPrinter: typeOfPrinter || 'Thermo',
      printPosition,
      showPrintDialog,
    };
}

/**
 * Map GLS PrintLabelsResponse to canonical Shopickup CreateLabelsResponse
 * 
 * The response contains:
 * - labels: PDF bytes (base64, Uint8Array, or number array)
 * - printLabelsInfoList: metadata about created labels
 * - printLabelsErrorList: any errors encountered
 * 
 * PrintLabels (one-step) creates parcels AND returns PDF in one call.
 * Returns one combined PDF for all parcels, similar to GetPrintedLabels.
 * 
 * @param glsResponse GLS PrintLabelsResponse
 * @param requestParcelCount Number of parcels in the original request
 * @returns Shopickup CreateLabelsResponse with single file and per-item results
 */
export function mapGLSPrintLabelsToCanonicalCreateLabels(
   glsResponse: GLSPrintLabelsResponse,
  requestParcelCount: number,
  printerType?: string
  ): CreateLabelsResponse {
   const successfulLabels = glsResponse.printLabelsInfoList || (glsResponse as any).PrintLabelsInfoList || [];
   const errors = glsResponse.printLabelsErrorList || (glsResponse as any).PrintLabelsErrorList || [];
 
   // Convert PDF bytes to Buffer or Uint8Array
   let pdfBuffer: Buffer | Uint8Array | undefined;
   const labels = glsResponse.labels || (glsResponse as any).Labels;
   if (labels) {
     if (typeof labels === 'string') {
        // Base64 string - convert to buffer
        try {
          pdfBuffer = Buffer.from(labels, 'base64');
        } catch (e) {
          // If not valid base64, try as-is
          pdfBuffer = Buffer.from(labels, 'utf8');
        }
      } else if (Array.isArray(labels)) {
        // Array of numbers (byte array from JSON) - convert to Buffer
        pdfBuffer = Buffer.from(labels);
      } else if (labels instanceof Uint8Array) {
        pdfBuffer = labels;
      } else if (Buffer.isBuffer(labels)) {
        pdfBuffer = labels;
      }
   }
 
   // Generate a unique file ID for this combined PDF
   const fileId = generateFileUuid();
 
   // Map errors to failed results
    const failedResults = errors.map((error: any, idx: number) => ({
      inputId: (error.clientReferenceList?.[0] || error.ClientReferenceList?.[0] || error.parcelIdList?.[0] || error.ParcelIdList?.[0] || `error-${idx}`) as string,
      status: 'failed' as const,
       errors: [
         {
           code: String(error.errorCode ?? error.ErrorCode),
           message: error.errorDescription || error.ErrorDescription,
         },
       ],
      raw: {
        ...error,
        category: mapGLSErrorCategory(error.errorCode ?? error.ErrorCode),
      },
    }));
 
   const allResults = [
     // Map successful labels to results - all on same PDF, use pageRange to indicate page
       ...successfulLabels.map((label: any, idx: number) => ({
       inputId: label.clientReference || label.ClientReference || String(label.parcelId || label.ParcelId),
       status: 'created' as const,
       fileId, // Reference the generated file ID
       pageRange: {
         start: idx + 1, // 1-indexed page number
         end: idx + 1,
       },
       carrierId: String(label.parcelId || label.ParcelId),
       raw: {
         parcelId: label.parcelId || label.ParcelId,
         clientReference: label.clientReference || label.ClientReference,
         parcelNumber: label.parcelNumber || label.ParcelNumber,
         pin: label.pin || label.Pin,
       },
     })),
     ...failedResults,
   ];
 
   const successCount = successfulLabels.length;
   const failureCount = errors.length;
   const totalCount = allResults.length;
 
   let summary = `Label generation complete`;
   if (failureCount === 0 && successCount > 0) {
     if (pdfBuffer) {
       summary = `All ${successCount} labels generated successfully (${pdfBuffer.length} bytes)`;
     } else {
       summary = `Metadata created for ${successCount} labels (PDF not available in response)`;
     }
   } else if (successCount === 0 && failureCount > 0) {
     summary = `All ${failureCount} labels failed`;
   } else if (successCount > 0 && failureCount > 0) {
     summary = `Mixed results: ${successCount} succeeded, ${failureCount} failed`;
   }
 
   // Create single file resource for combined PDF
   const files: LabelFileResource[] = pdfBuffer
     ? [
         {
           id: fileId,
           contentType: resolveLabelContentType(printerType),
           labelFormat: resolveLabelFormat(printerType),
           byteLength: pdfBuffer.length,
           pages: successCount, // One page per label
           orientation: 'portrait' as const,
           metadata: {
             combined: true,
             parcelCount: successCount,
             printerType: printerType || 'Thermo',
             labelFormat: resolveLabelFormat(printerType),
           },
            // Keep a unified binary access path across adapters.
            rawBytes: pdfBuffer,
         },
       ]
     : [];
 
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
     rawCarrierResponse: pdfBuffer
       ? { pdfBuffer, parcelCount: successCount }
       : undefined,
   };
 }

/**
 * Map canonical Shopickup CreateLabelsRequest to GLS GetPrintDataRequest
 * 
 * The request contains parcel carrier IDs (from a prior CreateParcels call).
 * GetPrintData requires both parcelIdList and parcelList per the OpenAPI spec.
 * We create minimal GLS parcel objects with just the ID reference in clientReference.
 * The GLS API will use the ID to look up the full parcel data.
 * 
 * IMPORTANT: This assumes parcels were already created via CreateParcels (PrepareLabels).
 * The parcelCarrierIds should be the GLS parcel IDs from that response.
 * 
 * @param req Shopickup CreateLabelsRequest with parcel carrier IDs
 * @param clientNumber GLS client account number
 * @param username GLS username (for auth)
 * @param hashedPassword GLS SHA512-hashed password
 * @param webshopEngine Optional webshop engine identifier
 * @returns GLS GetPrintDataRequest
 */
export function mapCanonicalCreateLabelsToGLSGetPrintData(
  req: CreateLabelsRequest,
  clientNumber: number,
  username: string,
  hashedPassword: number[],
  webshopEngine?: string
): GLSGetPrintDataRequest {
  // Map parcel carrier IDs to both parcelIdList and minimal parcelList
  // Per OpenAPI spec, parcelList is required even when using IDs
  const parcelIdList: number[] = req.parcelCarrierIds.map((id) => {
    // Try to parse as number, fallback to index if not numeric
    const parsed = parseInt(String(id), 10);
    return isNaN(parsed) ? 0 : parsed;
  });

  const glsParcels: GLSParcel[] = req.parcelCarrierIds.map((parcelCarrierId, idx) => ({
    clientReference: String(parcelCarrierId), // Use carrier ID as reference
    // Minimal address info - GLS will use existing parcel data for GetPrintData
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
    parcelIdList, // List of parcel IDs to retrieve
    parcelList: glsParcels, // Minimal parcel objects (required by spec, GLS uses existing data)
    username,
    password: hashedPassword,
    clientNumberList: [clientNumber],
    webshopEngine: webshopEngine || 'shopickup-adapter/1.0',
  };
}

/**
 * Map GLS GetPrintDataResponse to canonical Shopickup CreateLabelsResponse
 * 
 * The response contains:
 * - pdfdocument: PDF bytes (base64, Uint8Array, or number array) - may be absent in test API
 * - printDataInfoList: metadata about printed labels
 * - getPrintDataErrorList: any errors encountered
 * 
 * GetPrintData returns metadata-only (no PDF in test mode).
 * Similar structure to GetPrintedLabels but used differently.
 * 
 * @param glsResponse GLS GetPrintDataResponse
 * @param requestParcelCount Number of parcels in the original request
 * @returns Shopickup CreateLabelsResponse
 */
export function mapGLSGetPrintDataToCanonicalCreateLabels(
   glsResponse: GLSGetPrintDataResponse,
  requestParcelCount: number,
  printerType?: string
 ): CreateLabelsResponse {
   // Handle case sensitivity: GLS API returns PascalCase, but spec shows camelCase
   const successfulLabels = glsResponse.printDataInfoList || (glsResponse as any).PrintDataInfoList || [];
   const errors = glsResponse.getPrintDataErrorList || (glsResponse as any).GetPrintDataErrorList || [];
 
   // Convert PDF bytes to Buffer or Uint8Array
   let pdfBuffer: Buffer | Uint8Array | undefined;
   const pdfDocument = glsResponse.pdfdocument || (glsResponse as any).Pdfdocument;
   if (pdfDocument) {
     if (typeof pdfDocument === 'string') {
       // Base64 string - convert to buffer
       try {
         pdfBuffer = Buffer.from(pdfDocument, 'base64');
       } catch (e) {
         // If not valid base64, try as-is
         pdfBuffer = Buffer.from(pdfDocument, 'utf8');
       }
     } else if (Array.isArray(pdfDocument)) {
       // Array of numbers (byte array from JSON) - convert to Buffer
       pdfBuffer = Buffer.from(pdfDocument);
     } else if (pdfDocument instanceof Uint8Array) {
       pdfBuffer = pdfDocument;
     } else if (Buffer.isBuffer(pdfDocument)) {
       pdfBuffer = pdfDocument;
     }
   }
 
   // Generate a unique file ID for this combined PDF (only if PDF is present)
   const fileId = pdfBuffer ? generateFileUuid() : undefined;
 
   // Map errors to failed results
   const failedResults = errors.map((error: any, idx: number) => ({
     inputId: `error-${idx}`,
     status: 'failed' as const,
     errors: [
       {
         code: String(error.errorCode || error.ErrorCode),
         message: error.errorDescription || error.ErrorDescription,
       },
     ],
      raw: {
        ...error,
        category: mapGLSErrorCategory(error.errorCode ?? error.ErrorCode),
      },
   }));
 
   const allResults = [
     // Map successful labels to results - all on same PDF, use pageRange to indicate page
     ...successfulLabels.map((label: any, idx: number) => ({
       inputId: label.clientReference || label.ClientReference || String(label.parcelId || label.ParcelId),
       status: 'created' as const,
       fileId, // Reference the generated file ID (if PDF available)
       pageRange: fileId
         ? {
             start: idx + 1,
             end: idx + 1,
           }
         : undefined,
       carrierId: String(label.parcelId || label.ParcelId),
       raw: label,
     })),
     ...failedResults,
   ];
 
   const successCount = successfulLabels.length;
   const failureCount = errors.length;
   const totalCount = allResults.length;
 
   let summary = `Label retrieval complete`;
   if (failureCount === 0 && successCount > 0) {
     if (pdfBuffer) {
       summary = `All ${successCount} labels retrieved successfully (${pdfBuffer.length} bytes)`;
     } else {
       summary = `Metadata retrieved for ${successCount} labels (PDF not available in response)`;
     }
   } else if (successCount === 0 && failureCount > 0) {
     summary = `All ${failureCount} labels failed`;
   } else if (successCount > 0 && failureCount > 0) {
     summary = `Mixed results: ${successCount} succeeded, ${failureCount} failed`;
   }
 
   // Create single file resource if PDF available
   const files: LabelFileResource[] = pdfBuffer && fileId
     ? [
         {
           id: fileId,
           contentType: resolveLabelContentType(printerType),
           labelFormat: resolveLabelFormat(printerType),
           byteLength: pdfBuffer.length,
           pages: successCount,
           orientation: 'portrait' as const,
           metadata: {
             combined: true,
             parcelCount: successCount,
             flowType: 'GetPrintData',
             printerType: printerType || 'Thermo',
             labelFormat: resolveLabelFormat(printerType),
           },
            // Keep a unified binary access path across adapters.
            rawBytes: pdfBuffer,
         },
       ]
     : [];
 
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
     rawCarrierResponse: pdfBuffer
       ? { pdfBuffer, parcelCount: successCount }
       : undefined,
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

/**
 * Map canonical Shopickup CreateLabelsRequest to GLS GetPrintedLabelsRequest
 * 
 * The request contains parcel carrier IDs (from a prior CreateParcels call).
 * GetPrintedLabels retrieves PDF labels for existing parcel records.
 * 
 * IMPORTANT: This assumes parcels were already created via CreateParcels (PrepareLabels).
 * The parcelCarrierIds should be the GLS parcel IDs from that response.
 * 
 * @param req Shopickup CreateLabelsRequest with parcel carrier IDs
 * @param clientNumber GLS client account number (unused for this request, included for consistency)
 * @param username GLS username (for auth)
 * @param hashedPassword GLS SHA512-hashed password
 * @returns GLS GetPrintedLabelsRequest
 */
export function mapCanonicalCreateLabelsToGLSGetPrintedLabels(
  req: CreateLabelsRequest,
  clientNumber: number,
  username: string,
  hashedPassword: number[],
  printerType?: string
): GLSGetPrintedLabelsRequest {
  // Map parcel carrier IDs to parcel ID list
  const parcelIdList: number[] = req.parcelCarrierIds.map((id) => {
    // Try to parse as number, fallback to 0 if not numeric
    const parsed = parseInt(String(id), 10);
    return isNaN(parsed) ? 0 : parsed;
  });

  return {
    parcelIdList, // List of parcel IDs to retrieve labels for
    username,
    password: hashedPassword,
    clientNumberList: [clientNumber],
    typeOfPrinter: (printerType as any) || 'Thermo', // Default thermal printer
  };
}

/**
 * Map GLS GetPrintedLabelsResponse to canonical Shopickup CreateLabelsResponse
 * 
 * The response contains:
 * - labels: PDF bytes (base64, Uint8Array, or number array)
 * - printDataInfoList: metadata about printed labels
 * - getPrintedLabelsErrorList: any errors encountered
 * 
 * GLS returns ONE PDF for all parcels (combined), similar to Foxpost.
 * We create a single file resource and per-parcel results with pageRange.
 * 
 * @param glsResponse GLS GetPrintedLabelsResponse
 * @param requestParcelCount Number of parcels in the original request
 * @returns Shopickup CreateLabelsResponse with single file and per-item results
 */
export function mapGLSGetPrintedLabelsToCanonicalCreateLabels(
   glsResponse: GLSGetPrintedLabelsResponse,
  requestParcelCount: number,
  printerType?: string
 ): CreateLabelsResponse {
   // Handle case sensitivity: GLS API returns PascalCase, but spec shows camelCase
   const successfulLabels = glsResponse.printDataInfoList || (glsResponse as any).PrintDataInfoList || [];
   const errors = glsResponse.getPrintedLabelsErrorList || (glsResponse as any).GetPrintedLabelsErrorList || [];
 
   // Convert PDF bytes to Buffer or Uint8Array
   let pdfBuffer: Buffer | Uint8Array | undefined;
   const labels = glsResponse.labels || (glsResponse as any).Labels;
   if (labels) {
     if (typeof labels === 'string') {
       // Base64 string - convert to buffer
       try {
         pdfBuffer = Buffer.from(labels, 'base64');
       } catch (e) {
         // If not valid base64, try as-is
         pdfBuffer = Buffer.from(labels, 'utf8');
       }
     } else if (Array.isArray(labels)) {
       // Array of numbers (byte array from JSON) - convert to Buffer
       pdfBuffer = Buffer.from(labels);
     } else if (labels instanceof Uint8Array) {
       pdfBuffer = labels;
     } else if (Buffer.isBuffer(labels)) {
       pdfBuffer = labels;
     }
   }
 
   // Generate a unique file ID for this combined PDF
   const fileId = generateFileUuid();
 
   // Map errors to failed results
   const failedResults = errors.map((error: any, idx: number) => ({
     inputId: `error-${idx}`,
     status: 'failed' as const,
     errors: [
       {
         code: String(error.errorCode || error.ErrorCode),
         message: error.errorDescription || error.ErrorDescription,
       },
     ],
      raw: {
        ...error,
        category: mapGLSErrorCategory(error.errorCode ?? error.ErrorCode),
      },
   }));
 
   const allResults = [
     // Map successful labels to results - all on same PDF, use pageRange to indicate page
     ...successfulLabels.map((label: any, idx: number) => ({
       inputId: label.clientReference || label.ClientReference || String(label.parcelId || label.ParcelId),
       status: 'created' as const,
       fileId, // Reference the generated file ID
       pageRange: {
         start: idx + 1, // 1-indexed page number
         end: idx + 1,
       },
       carrierId: String(label.parcelId || label.ParcelId),
       raw: {
         parcelId: label.parcelId || label.ParcelId,
         clientReference: label.clientReference || label.ClientReference,
         parcelNumber: label.parcelNumber || label.ParcelNumber,
       },
     })),
     ...failedResults,
   ];
 
   const successCount = successfulLabels.length;
   const failureCount = errors.length;
   const totalCount = allResults.length;
 
   let summary = `Label retrieval complete`;
   if (failureCount === 0 && successCount > 0) {
     if (pdfBuffer) {
       summary = `All ${successCount} labels retrieved successfully (${pdfBuffer.length} bytes)`;
     } else {
       summary = `Metadata retrieved for ${successCount} labels (PDF not available in response)`;
     }
   } else if (successCount === 0 && failureCount > 0) {
     summary = `All ${failureCount} labels failed`;
   } else if (successCount > 0 && failureCount > 0) {
     summary = `Mixed results: ${successCount} succeeded, ${failureCount} failed`;
   }
 
   // Create single file resource for combined PDF (like Foxpost)
   const files: LabelFileResource[] = pdfBuffer
     ? [
         {
           id: fileId,
           contentType: resolveLabelContentType(printerType),
           labelFormat: resolveLabelFormat(printerType),
           byteLength: pdfBuffer.length,
           pages: successCount, // One page per label
           orientation: 'portrait' as const,
           metadata: {
             combined: true,
             parcelCount: successCount,
             printerType: printerType || 'Thermo', // Default from request
             labelFormat: resolveLabelFormat(printerType),
           },
            // Keep a unified binary access path across adapters.
            rawBytes: pdfBuffer,
         },
       ]
     : [];
 
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
     rawCarrierResponse: pdfBuffer
       ? { pdfBuffer, parcelCount: successCount }
       : undefined,
   };
 }
