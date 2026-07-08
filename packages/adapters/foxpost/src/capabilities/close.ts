/**
 * Foxpost Adapter: Close Shipments Capability
 * Handles CLOSE_SHIPMENT operation
 *
 * Foxpost's closest equivalent to a "close shipments" batch operation is the
 * delivery note (bill of delivery) PDF: POST /api/label/deliveryNote.
 * It does not close/lock parcels server-side (Foxpost parcels don't have a
 * separate shipment/closing concept), but it produces the same manifest-style
 * document integrators need when handing a batch of parcels to the courier.
 */

import type {
  AdapterContext,
  CloseShipmentsRequest,
  CloseShipmentsResponse,
  LabelFileResource,
} from '@shopickup/core';
import { CarrierError, errorToLog, serializeForLog } from '@shopickup/core';
import { translateFoxpostError } from '../errors.js';
import {
  safeValidateCloseShipmentsRequest,
  safeValidateFoxpostDeliveryNotePdfRaw,
  safeValidateFoxpostApiError,
} from '../validation.js';
import type { CloseShipmentsRequestFoxpost } from '../validation.js';
import { buildFoxpostBinaryHeaders } from '../utils/httpUtils.js';
import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';
import { randomUUID } from 'node:crypto';

function sanitizeRawValue(value: unknown, keyHint?: string): unknown {
  if (typeof value === 'string') {
    return value;
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return {
      omittedBinary: true,
      byteLength: value.byteLength,
      note: 'binary payload omitted from rawCarrierResponse',
    };
  }

  if (value instanceof ArrayBuffer) {
    return {
      omittedBinary: true,
      byteLength: value.byteLength,
      note: 'binary payload omitted from rawCarrierResponse',
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRawValue(item));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeRawValue(nested, key);
    }
    return out;
  }

  return value;
}

/**
 * Close shipments for Foxpost by generating a delivery note (bill of delivery) PDF.
 *
 * Foxpost POST /api/label/deliveryNote endpoint:
 * - Takes { sender, clFoxCodes } (sender account id + parcel barcodes)
 * - Returns a single PDF binary covering all requested parcels
 *
 * Unlike MPL, Foxpost returns one manifest document for the whole batch rather
 * than one per tracking number, so every result references the same file.
 */
export async function closeShipments(
  req: CloseShipmentsRequest | unknown,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CloseShipmentsResponse> {
  const validated = safeValidateCloseShipmentsRequest(req);
  if (!validated.success) {
    throw new CarrierError(
      `Invalid close shipments request: ${validated.error.message}`,
      'Validation',
      { raw: serializeForLog(validated.error) as any },
    );
  }

  const data: CloseShipmentsRequestFoxpost = validated.data;

  if (!ctx.http) {
    throw new CarrierError('HTTP client not provided in context', 'Permanent');
  }

  const baseUrl = resolveBaseUrl({ useTestApi: data.options?.useTestApi ?? false });
  const url = `${baseUrl}/api/label/deliveryNote`;

  const body = {
    sender: data.options?.foxpost?.sender,
    clFoxCodes: data.trackingNumbers,
  };

  ctx.logger?.debug('Foxpost: Closing shipments (generating delivery note)', {
    trackingNumbers: data.trackingNumbers.length,
  });

  try {
    const httpResponse = await ctx.http.post<Buffer>(url, body, {
      headers: buildFoxpostBinaryHeaders(data.credentials),
      responseType: 'arraybuffer',
    });

    const pdfBuffer = httpResponse.body;

    const pdfValidation = safeValidateFoxpostDeliveryNotePdfRaw(pdfBuffer);
    if (!pdfValidation.success) {
      throw new CarrierError(
        `Invalid delivery note PDF response: ${pdfValidation.error.message}`,
        'Transient',
        { raw: serializeForLog(pdfValidation.error) as any },
      );
    }

    const byteLength = pdfBuffer instanceof Buffer || pdfBuffer instanceof Uint8Array
      ? pdfBuffer.byteLength
      : 0;

    const fileId = randomUUID();
    const file: LabelFileResource = {
      id: fileId,
      contentType: 'application/pdf',
      labelFormat: 'PDF',
      byteLength,
      metadata: {
        documentType: 'delivery-note',
        sender: data.options?.foxpost?.sender,
        parcelCount: data.trackingNumbers.length,
      },
      rawBytes: pdfBuffer,
    };

    const results = data.trackingNumbers.map((trackingNumber) => ({
      manifestId: undefined,
      fileIds: [fileId],
      raw: { trackingNumber },
    }));

    ctx.logger?.info('Foxpost: Delivery note generated', {
      count: data.trackingNumbers.length,
      testMode: data.options?.useTestApi ?? false,
    });

    return {
      results,
      files: [file],
      successCount: results.length,
      failureCount: 0,
      totalCount: results.length,
      allSucceeded: true,
      allFailed: false,
      someFailed: false,
      summary: `Delivery note generated for ${results.length} parcel(s)`,
      rawCarrierResponse: sanitizeRawValue(serializeForLog(httpResponse)),
    };
  } catch (err) {
    if (err instanceof CarrierError) throw err;

    const httpStatus = (err as any)?.response?.status;
    let errorMessage: string | undefined;

    if (httpStatus) {
      try {
        let errorBody = (err as any)?.response?.data;
        if (Buffer.isBuffer(errorBody)) {
          errorBody = JSON.parse(errorBody.toString('utf-8'));
        } else if (errorBody instanceof Uint8Array) {
          errorBody = JSON.parse(new TextDecoder().decode(errorBody));
        }

        const apiErrorValidation = errorBody ? safeValidateFoxpostApiError(errorBody) : undefined;
        if (apiErrorValidation?.success && apiErrorValidation.data.error) {
          errorMessage = apiErrorValidation.data.error;
        }
      } catch {
        // ignore parse failures; fall back to translateFoxpostError's generic message
      }
    }

    ctx.logger?.error('Foxpost: Close shipments failed', {
      count: data.trackingNumbers.length,
      error: errorToLog(err),
    });

    const translated = translateFoxpostError(err);
    throw errorMessage
      ? new CarrierError(errorMessage, translated.category, { carrierCode: translated.carrierCode, raw: translated.raw })
      : translated;
  }
}
