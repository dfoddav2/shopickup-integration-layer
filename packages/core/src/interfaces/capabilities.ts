/**
 * Capability enum
 * Defines what operations a carrier adapter supports
 */
export const Capabilities = {
  RATES: "RATES",
  CREATE_SHIPMENT: "CREATE_SHIPMENT",
  CREATE_PARCEL: "CREATE_PARCEL",
  CREATE_PARCELS: "CREATE_PARCELS",
  CLOSE_SHIPMENT: "CLOSE_SHIPMENT",
  CREATE_LABEL: "CREATE_LABEL",
  VOID_LABEL: "VOID_LABEL",
  TRACK: "TRACK",
  PICKUP: "PICKUP",
  WEBHOOKS: "WEBHOOKS",
  TEST_MODE_SUPPORTED: "TEST_MODE_SUPPORTED",
} as const;

export type Capability = (typeof Capabilities)[keyof typeof Capabilities];
