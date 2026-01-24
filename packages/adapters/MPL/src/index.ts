import { AdapterContext, Capabilities, Capability, CarrierAdapter, CarrierError, CarrierResource } from '@shopickup/core';

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
 * - TEST_MODE_SUPPORTED: Can switch to test API for sandbox testing
 * 
 * Test API:
 * - Production: 	https://core.api.posta.hu/v2/mplapi
 * - Test/Sandbox: 	https://sandbox.api.posta.hu/v2/mplapi
 * - Pass options.useTestApi = true in request to switch to test endpoint for that call
 * - Test API requires separate test credentials
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
        Capabilities.TEST_MODE_SUPPORTED,
    ];

    // MPL requires close before label generation
    readonly requires = {
        createLabel: [Capabilities.CREATE_PARCEL],
    }

    private prodBaseUrl = "https://core.api.posta.hu/v2/mplapi";
    private testBaseUrl = "https://sandbox.api.posta.hu/v2/mplapi";

    constructor(baseUrl?: string) {
        if (baseUrl) {
            this.prodBaseUrl = baseUrl;
        }
    }

    /**
     * Resolve the base URL based on test mode flag
     * @param useTestApi Whether to use test API endpoint
     * @returns Base URL to use for this request
     */
    private getBaseUrl(useTestApi?: boolean): string {
        return useTestApi ? this.testBaseUrl : this.prodBaseUrl;
    }

    /**
     * Placeholder implementations - not yet implemented
     * These methods are declared in capabilities but will throw NotImplementedError if called
     * without a proper implementation.
     */
    async createParcel(
        _req: any,
        _ctx: AdapterContext
    ): Promise<CarrierResource> {
        throw new CarrierError(
            "createParcel not yet implemented for MPL adapter",
            "Permanent"
        );
    }

    async createParcels(
        _req: any,
        _ctx: AdapterContext
    ): Promise<any> {
        throw new CarrierError(
            "createParcels not yet implemented for MPL adapter",
            "Permanent"
        );
    }

    async createLabel(
        _parcelCarrierId: string,
        _ctx: AdapterContext
    ): Promise<CarrierResource> {
        throw new CarrierError(
            "createLabel not yet implemented for MPL adapter",
            "Permanent"
        );
    }

    async track(
        _req: any,
        _ctx: AdapterContext
    ): Promise<any> {
        throw new CarrierError(
            "track not yet implemented for MPL adapter",
            "Permanent"
        );
    }

}