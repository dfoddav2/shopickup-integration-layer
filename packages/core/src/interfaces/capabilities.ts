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
  LIST_PICKUP_POINTS: "LIST_PICKUP_POINTS",
  EXCHANGE_AUTH_TOKEN: "EXCHANGE_AUTH_TOKEN",
} as const;

export type Capability = (typeof Capabilities)[keyof typeof Capabilities];
