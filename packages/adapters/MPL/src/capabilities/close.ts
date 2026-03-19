import type { AdapterContext, CloseShipmentsRequest, CloseShipmentsResponse } from '@shopickup/core';
import { CarrierError, serializeForLog } from '@shopickup/core';
import { safeValidateCredentials, safeValidateCloseShipmentsRequest } from '../validation.js';
import { buildMPLHeaders } from '../utils/httpUtils.js';
import { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';

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

    // Build core CloseShipmentsResponse
    const closeResults = results.map((r: any) => ({
      manifestId: r.dispatchId?.toString?.() ?? undefined,
      manifest: r.manifest ?? r.manifestSUM ?? r.manifestRA ?? undefined,
      errors: r.errors,
      warnings: r.warnings,
      raw: r,
    }));

    const successCount = closeResults.filter((c) => !c.errors || c.errors.length === 0).length;
    const failureCount = closeResults.length - successCount;

    return {
      results: closeResults,
      successCount,
      failureCount,
      totalCount: closeResults.length,
      allSucceeded: failureCount === 0 && closeResults.length > 0,
      allFailed: successCount === 0 && closeResults.length > 0,
      someFailed: failureCount > 0 && successCount > 0,
      summary: `${successCount} manifests generated, ${failureCount} failed`,
      rawCarrierResponse: serializeForLog(httpRes),
    };
  } catch (err) {
    if (err instanceof CarrierError) throw err;
    ctx.logger?.error('MPL: Close shipments failed', { error: (err as any)?.message });
    throw new CarrierError(`Close shipments failed: ${(err as any)?.message ?? 'Unknown'}`, 'Transient', { raw: serializeForLog(err) });
  }
}
