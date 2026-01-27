import { AdapterContext, Capabilities, Capability, CarrierAdapter, CarrierError, CarrierResource, CreateLabelRequest, CreateLabelsRequest, CreateLabelsResponse, LabelResult, CreateParcelRequest, CreateParcelsRequest, CreateParcelsResponse, TrackingRequest, TrackingUpdate, FetchPickupPointsRequest, FetchPickupPointsResponse } from '@shopickup/core';
import { createResolveBaseUrl, createResolveOAuthUrl, ResolveBaseUrl, ResolveOAuthUrl } from './utils/resolveBaseUrl.js';
import { fetchPickupPoints as fetchPickupPointsImpl } from './capabilities/index.js';
import { exchangeAuthToken as exchangeAuthTokenImpl } from './capabilities/auth.js';
import { createParcel as createParcelImpl, createParcels as createParcelsImpl } from './capabilities/parcels.js';
import { createLabel as createLabelImpl, createLabels as createLabelsImpl } from './capabilities/label.js';
import type { ExchangeAuthTokenRequest, ExchangeAuthTokenResponse } from './validation.js';

/**
 * MPLAdapter
 * 
 * MPL (hu-mpl) is a major Hungarian logistics carrier.
 * 
 * Capabilities supported:
 * - CREATE_PARCEL: Create parcels directly
 * - CREATE_PARCELS: Batch create multiple parcels
 * - CREATE_LABEL: Generate PDF labels for parcels
 * - TRACK: Track parcels by barcode
 * - EXCHANGE_AUTH_TOKEN: Exchange API credentials for OAuth2 Bearer token
 * - TEST_MODE_SUPPORTED: Can switch to test API for sandbox testing
 * 
 * Test API:
 * - Production: 	https://core.api.posta.hu/v2/mplapi
 * - Test/Sandbox: 	https://sandbox.api.posta.hu/v2/mplapi
 * - Pass options.useTestApi = true in request to switch to test endpoint for that call
 * - Test API requires separate test credentials
 * 
 * OAuth Token Exchange:
 * - Call exchangeAuthToken() to exchange API credentials for a Bearer token
 * - Cached internally within the adapter; TTL is ~1 hour
 * - Returns access_token, expires_in, and token_type
 * - Useful when Basic auth is disabled at account level
 * 
 * OAuth Fallback:
 * - Wrap HTTP client with withOAuthFallback() to automatically exchange credentials
 *   when receiving 401 "Basic auth not enabled" error
 * - No explicit calls needed; fallback is transparent
 * 
 * Notes:
 * - MPL does NOT have a shipment concept; parcels are created directly
 * - Labels are generated per parcel
 * - Tracking available via barcode (FoxWeb barcode format: CLFOX...)
 * - createLabel does not support per-call test mode (no request object in interface)
 */
export class MPLAdapter implements CarrierAdapter {
    readonly id = "hu-mpl";
    readonly displayName = "MPL Hungary";

    readonly capabilities: Capability[] = [
        Capabilities.CREATE_PARCEL,
        Capabilities.CREATE_PARCELS,
        Capabilities.CREATE_LABEL,
        Capabilities.TRACK,
        Capabilities.CLOSE_SHIPMENT,
        Capabilities.TEST_MODE_SUPPORTED,
        Capabilities.EXCHANGE_AUTH_TOKEN,
    ];

    // MPL requires close before label generation
    readonly requires = {
        createLabel: [Capabilities.CREATE_PARCEL, Capabilities.CLOSE_SHIPMENT],
    }

    private prodBaseUrl = "https://core.api.posta.hu/v2/mplapi";
    private testBaseUrl = "https://sandbox.api.posta.hu/v2/mplapi";
    private prodOAuthUrl = "https://core.api.posta.hu/oauth2/token";
    private testOAuthUrl = "https://sandbox.api.posta.hu/oauth2/token";
    private resolveBaseUrl: ResolveBaseUrl;
    private resolveOAuthUrl: ResolveOAuthUrl;
    private accountingCode: string = "";

    constructor(baseUrl: string = "https://core.api.posta.hu/v2/mplapi", accountingCode: string = "") {
        this.prodBaseUrl = "https://core.api.posta.hu/v2/mplapi";
        this.testBaseUrl = "https://sandbox.api.posta.hu/v2/mplapi";
        this.prodOAuthUrl = "https://core.api.posta.hu/oauth2/token";
        this.testOAuthUrl = "https://sandbox.api.posta.hu/oauth2/token";
        this.resolveBaseUrl = createResolveBaseUrl(this.prodBaseUrl, this.testBaseUrl);
        this.resolveOAuthUrl = createResolveOAuthUrl(this.prodOAuthUrl, this.testOAuthUrl);
        this.accountingCode = accountingCode;
    }

    /**
     * Create a single parcel in MPL
     */
    async createParcel(
        req: CreateParcelRequest,
        ctx: AdapterContext
    ): Promise<CarrierResource> {
        return createParcelImpl(
            req,
            ctx,
            (batchReq, batchCtx) => this.createParcels(batchReq, batchCtx)
        );
    }

    /**
     * Create multiple parcels in MPL (batch operation)
     */
    async createParcels(
        req: CreateParcelsRequest,
        ctx: AdapterContext
    ): Promise<CreateParcelsResponse> {
        return createParcelsImpl(req, ctx, this.resolveBaseUrl);
    }

    async createLabel(
        req: CreateLabelRequest,
        ctx: AdapterContext
    ): Promise<LabelResult> {
        return createLabelImpl(req, ctx);
    }

    async createLabels(
        req: CreateLabelsRequest,
        ctx: AdapterContext
    ): Promise<CreateLabelsResponse> {
        return createLabelsImpl(req, ctx);
    }

    async track(
        _req: TrackingRequest,
        _ctx: AdapterContext
    ): Promise<TrackingUpdate> {
        throw new CarrierError(
            "track not yet implemented for MPL adapter",
            "Permanent"
        );
    }

    async exchangeAuthToken(
        req: ExchangeAuthTokenRequest,
        ctx: AdapterContext,
    ): Promise<ExchangeAuthTokenResponse> {
        return exchangeAuthTokenImpl(req, ctx, this.resolveOAuthUrl, this.accountingCode);
    }

    async fetchPickupPoints(
        req: FetchPickupPointsRequest,
        ctx: AdapterContext,
    ): Promise<FetchPickupPointsResponse> {
        return fetchPickupPointsImpl(req, ctx, this.resolveBaseUrl);
    }
}

// Export utilities for use with dev server or other integrations
export { withOAuthFallback } from './utils/oauthFallback.js';
export { createResolveBaseUrl, createResolveOAuthUrl };
export type { ResolveBaseUrl, ResolveOAuthUrl };