import type { AdapterContext, CloseShipmentsRequest, CloseShipmentsResponse, LabelFileResource } from '@shopickup/core';
import { CarrierError, serializeForLog } from '@shopickup/core';
import { safeValidateCredentials, safeValidateCloseShipmentsRequest } from '../validation.js';
import { buildMPLHeaders } from '../utils/httpUtils.js';
import { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';
import { randomUUID } from 'node:crypto';

const MANIFEST_FIELDS = ['manifest', 'manifestSUM', 'manifestRA'] as const;
type ManifestField = (typeof MANIFEST_FIELDS)[number];

const MANIFEST_LABELS: Record<ManifestField, string> = {
  manifest: 'delivery-note',
  manifestSUM: 'posting-list',
  manifestRA: 'pallet-posting-list',
};

const BLOB_FIELDS = new Set(MANIFEST_FIELDS as readonly string[]);

function sanitizeRawValue(value: unknown, keyHint?: string): unknown {
  if (typeof value === 'string') {
    if (keyHint && BLOB_FIELDS.has(keyHint)) {
      return `[truncated ${keyHint}; length=${value.length}]`;
    }
    return value;
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
 * Decode the manifest/manifestSUM/manifestRA base64 fields on a ShipmentCloseResult
 * into structured file resources, mirroring how label PDFs are handled in label.ts.
 */
function buildManifestFiles(result: any): LabelFileResource[] {
  const files: LabelFileResource[] = [];

  for (const field of MANIFEST_FIELDS) {
    const base64 = result?.[field];
    if (typeof base64 !== 'string' || base64.length === 0) continue;

    const buffer = Buffer.from(base64, 'base64');
    files.push({
      id: randomUUID(),
      contentType: 'application/pdf',
      labelFormat: 'PDF',
      byteLength: buffer.byteLength,
      metadata: { manifestField: field, documentType: MANIFEST_LABELS[field] },
      rawBytes: buffer,
    });
  }

  return files;
}

/**
 * Close shipments for MPL
 * Accepts core CloseShipmentsRequest-like shape but uses MPL-specific schema
 */
export async function closeShipments(
  req: CloseShipmentsRequest | unknown,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CloseShipmentsResponse> {
  try {
    // Validate full request envelope against MPL-shaped schema if possible
    const validatedReq = safeValidateCloseShipmentsRequest(req);
    if (!validatedReq.success) {
      throw new CarrierError('Invalid close shipments request', 'Validation', { raw: validatedReq });
    }

    const validated = validatedReq.data;

    // MPL expects trackingNumbers array + mpl accounting code under options
    const body: any = {
      fromDate: validated.close?.fromDate ?? undefined,
      toDate: validated.close?.toDate ?? undefined,
      trackingNumbers: validated.trackingNumbers ?? validated.close?.trackingNumbers,
      checkList: validated.close?.checkList,
      checkListWithPrice: validated.close?.checkListWithPrice,
      tag: validated.close?.tag,
      requestId: validated.close?.requestId,
      summaryList: validated.close?.summaryList,
      singleFile: validated.close?.singleFile,
    };

    if (!ctx.http) {
      throw new CarrierError('HTTP client not provided in context', 'Permanent');
    }

    // Resolve base URL (supports useTestApi via options.useTestApi)
    const baseUrl = resolveBaseUrl({ useTestApi: (validated.options?.useTestApi) ?? false });
    const url = `${baseUrl}/shipments/close`;

    const accountingCode = validated.options?.mpl?.accountingCode;

    // Build headers (uses validated credentials + accounting code)
    const headers = buildMPLHeaders(validated.credentials, accountingCode ?? '');

    ctx.logger?.debug('MPL: Closing shipments', { trackingNumbers: (body.trackingNumbers || []).length });

    const httpRes = await ctx.http.post(url, body, { headers });

    const parsed = httpRes.body;

    // If response is array of ShipmentCloseResult per OpenAPI, normalize
    const results = Array.isArray(parsed) ? parsed : [parsed];

    // Build core CloseShipmentsResponse, decoding manifest/manifestSUM/manifestRA
    // base64 fields into structured file resources (same pattern as label.ts)
    const files: LabelFileResource[] = [];
    const closeResults = results.map((r: any) => {
      const manifestFiles = buildManifestFiles(r);
      files.push(...manifestFiles);

      return {
        manifestId: r.dispatchId?.toString?.() ?? undefined,
        fileIds: manifestFiles.length > 0 ? manifestFiles.map((f) => f.id) : undefined,
        errors: r.errors,
        warnings: r.warnings,
        raw: r,
      };
    });

    const successCount = closeResults.filter((c) => !c.errors || c.errors.length === 0).length;
    const failureCount = closeResults.length - successCount;

    return {
      results: closeResults,
      files,
      successCount,
      failureCount,
      totalCount: closeResults.length,
      allSucceeded: failureCount === 0 && closeResults.length > 0,
      allFailed: successCount === 0 && closeResults.length > 0,
      someFailed: failureCount > 0 && successCount > 0,
      summary: `${successCount} manifests generated, ${failureCount} failed`,
      rawCarrierResponse: sanitizeRawValue(serializeForLog(httpRes)),
    };
  } catch (err) {
    if (err instanceof CarrierError) throw err;
    ctx.logger?.error('MPL: Close shipments failed', { error: (err as any)?.message });
    throw new CarrierError(`Close shipments failed: ${(err as any)?.message ?? 'Unknown'}`, 'Transient', { raw: serializeForLog(err) });
  }
}
