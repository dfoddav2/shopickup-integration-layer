/**
 * Capability enum
 * Defines what operations a carrier adapter supports
 */
export declare const Capabilities: {
    readonly RATES: "RATES";
    readonly CREATE_SHIPMENT: "CREATE_SHIPMENT";
    readonly CREATE_PARCEL: "CREATE_PARCEL";
    readonly CLOSE_SHIPMENT: "CLOSE_SHIPMENT";
    readonly CREATE_LABEL: "CREATE_LABEL";
    readonly VOID_LABEL: "VOID_LABEL";
    readonly TRACK: "TRACK";
    readonly PICKUP: "PICKUP";
    readonly WEBHOOKS: "WEBHOOKS";
};
export type Capability = (typeof Capabilities)[keyof typeof Capabilities];
//# sourceMappingURL=capabilities.d.ts.map