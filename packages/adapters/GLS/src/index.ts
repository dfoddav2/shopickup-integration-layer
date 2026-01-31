/**
 * GLS Adapter for Shopickup
 * 
 * GLS (hu-gls) is a major Hungarian and Eastern European logistics carrier.
 * 
 * Capabilities supported (Phase 1):
 * - FETCH_PICKUP_POINTS: Fetch list of pickup points/delivery locations
 * 
 * Future capabilities (Phase 2+):
 * - CREATE_SHIPMENT: Create shipments via MyGLS API
 * - CREATE_LABEL: Generate labels for shipments
 * - TRACK: Track shipments and parcels
 * - CLOSE_SHIPMENT: Close shipments for label generation
 * 
 * Pickup Points:
 * - Public, unauthenticated feed
 * - URL: https://map.gls-hungary.com/data/deliveryPoints/{country}.json
 * - Supported countries: AT, BE, BG, CZ, DE, DK, ES, FI, FR, GR, HR, HU, IT, LU, NL, PL, PT, RO, SI, SK, RS
 * 
 * MyGLS API (future):
 * - Servers: Test and production for 7 regions (HU, CZ, HR, RO, SI, SK, RS)
 * - Authentication: Basic auth or custom headers
 * - Operations: Parcel creation, label generation, tracking, etc.
 */

import type {
  AdapterContext,
  Capability,
  CarrierAdapter,
  FetchPickupPointsRequest,
  FetchPickupPointsResponse,
} from '@shopickup/core';
import { Capabilities } from '@shopickup/core';
import { fetchPickupPoints as fetchPickupPointsImpl } from './capabilities/index.js';

/**
 * GLS Adapter
 * 
 * Currently implements FETCH_PICKUP_POINTS capability for accessing
 * the public GLS pickup points/delivery locations feed across 20+ countries.
 */
export class GLSAdapter implements CarrierAdapter {
  readonly id = 'hu-gls';
  readonly displayName = 'GLS Hungary';

  readonly capabilities: Capability[] = [Capabilities.LIST_PICKUP_POINTS];

  /**
   * Create a new GLS adapter instance
   */
  constructor() {
    // GLS adapter is currently stateless
    // Constructor exists for future configuration needs
  }

  /**
   * Fetch pickup points from GLS public feed
   * 
   * @param req Request with country code (required)
   * @param ctx Adapter context with HTTP client
   * @returns Response with list of pickup points
   */
  async fetchPickupPoints(req: FetchPickupPointsRequest, ctx: AdapterContext): Promise<FetchPickupPointsResponse> {
    return fetchPickupPointsImpl(req, ctx);
  }
}

// Export types for external use
export type { GLSDeliveryPoint, GLSDeliveryPointsFeed } from './types/index.js';
export * from './mappers/index.js';
