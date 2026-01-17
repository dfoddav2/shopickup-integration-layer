/**
 * Foxpost HTTP Client Wrapper
 * Thin wrapper around HTTP calls to Foxpost API
 */

import type { HttpClient } from "@shopickup/core";
import type {
  CreateParcelRequest,
  CreateResponse,
  TrackDTO,
  Tracking,
  LabelInfo,
} from "./types/generated";

/**
 * FoxpostClient
 * Minimal wrapper around Foxpost HTTP endpoints
 */
export class FoxpostClient {
  constructor(
    private baseUrl: string,
    private apiKey?: string
  ) {}

  /**
   * Create parcels in Foxpost
   */
  async createParcels(
    parcels: CreateParcelRequest[],
    http: HttpClient,
    options: { isWeb?: boolean; isRedirect?: boolean } = {}
  ): Promise<CreateResponse> {
    const params = new URLSearchParams();
    if (options.isWeb !== undefined) params.append("isWeb", String(options.isWeb));
    if (options.isRedirect !== undefined) params.append("isRedirect", String(options.isRedirect));

    const url = `${this.baseUrl}/api/parcel?${params}`;

    return http.post<CreateResponse>(url, parcels, {
      headers: this.buildHeaders(),
    });
  }

  /**
   * Generate label PDF
   */
  async generateLabel(
    barcodes: string[],
    pageSize: "A5" | "A6" | "A7" | "_85X85" = "A7",
    http?: HttpClient
  ): Promise<Buffer> {
    // This is a placeholder - actual implementation would handle binary response
    // In real implementation, would use ctx.http to make the call
    throw new Error("generateLabel not yet implemented");
  }

  /**
   * Get tracking for a parcel
   */
  async getTracking(
    barcode: string,
    http: HttpClient
  ): Promise<Tracking> {
    const url = `${this.baseUrl}/api/tracking/${barcode}`;

    return http.get<Tracking>(url, {
      headers: this.buildHeaders(),
    });
  }

  /**
   * Get tracking history for a parcel
   */
  async getTrackingHistory(
    barcode: string,
    http: HttpClient
  ): Promise<TrackDTO[]> {
    const url = `${this.baseUrl}/api/tracking/tracks/${barcode}`;

    return http.get<TrackDTO[]>(url, {
      headers: this.buildHeaders(),
    });
  }

  /**
   * Get label info for a parcel
   */
  async getLabelInfo(
    barcode: string,
    http: HttpClient
  ): Promise<LabelInfo> {
    const url = `${this.baseUrl}/api/label/info/${barcode}`;

    return http.get<LabelInfo>(url, {
      headers: this.buildHeaders(),
    });
  }

  /**
   * Build common headers for Foxpost requests
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["api-key"] = this.apiKey;
    }

    return headers;
  }
}
