import { z } from 'zod';

/**
 * Schemas for MPL adapter credentials
 * Supports two auth types:
 * 1. API Key authentication with apiKey and apiSecret
 * 2. OAuth2 authentication with oAuth2Token
 */
const ApiKeyBranch = z.object({
    authType: z.literal('apiKey'),
    apiKey: z.string().min(1),
    apiSecret: z.string().min(1),
    accountingCode: z.string().optional(),
});

const OAuthBranch = z.object({
    authType: z.literal('oauth2'),
    oAuth2Token: z.string().min(1),
    accountingCode: z.string().optional(),
});

/**
 * Injects authType discriminant based on presence of oAuth2Token or apiKey.
 * Allows callers to pass credentials without explicitly setting authType.
 */
export const MPLCredentialsSchema = z.preprocess((input) => {
    if (input && typeof input === 'object') {
        const anyInput = input as any;
        // Prefer oauth2 if token is present
        if (anyInput.oAuth2Token) {
            return { ...anyInput, authType: 'oauth2' };
        }
        // Otherwise default to apiKey
        if (anyInput.apiKey && anyInput.apiSecret) {
            return { ...anyInput, authType: 'apiKey' };
        }
    }
    return input;
}, z.discriminatedUnion('authType', [ApiKeyBranch, OAuthBranch]));

export type MPLCredentials = z.infer<typeof MPLCredentialsSchema>;

/**
 * Schema for servicePointTypes
 * 
 * 'PM' - Postán Maradó (Post Office)
 * 'HA' - Házhozszállítás (Home Delivery)
 * 'RA' - Raklapos Kézbesítés (Pallet Delivery)
 * 'PP' - PostaPont (Post Point)
 * 'CS' - Csomagautomata (Parcel Locker)
 */
const ServicePointTypeSchema = z.enum(['PM', 'HA', 'RA', 'PP', 'CS']);
export type ServicePointType = z.infer<typeof ServicePointTypeSchema>;
const PickupServicePointTypeSchema = z.enum(['PM', 'PP', 'CS']);
export type PickupServicePointType = z.infer<typeof PickupServicePointTypeSchema>;

/**
 * Schema for fetchPickupPoints request
 * 
 * Requires MPLCredentials
 * 
 * Optional filters:
 * - postCode: 4-character string
 * - city: string
 * - servicePointType: one of the defined ServicePointType values
 */
export const FetchPickupPointsMPLSchema = z.object({
    credentials: MPLCredentialsSchema,
    accountingCode: z.string().min(1),
    postCode: z.preprocess((val) => {
        if (typeof val === 'string' && val.trim() === '') return undefined;
        return val;
    }, z.string().length(4).optional()),
    city: z.preprocess((val) => {
        if (typeof val === 'string' && val.trim() === '') return undefined;
        return val;
    }, z.string().optional()),
    servicePointType: z.array(PickupServicePointTypeSchema).optional(),
    options: z.object({
        useTestApi: z.boolean().optional(),
    }).optional(),
});

export type FetchPickupPointsMPLRequest = z.infer<typeof FetchPickupPointsMPLSchema>;

/**
 * Schema for exchangeAuthToken request
 * 
 * Requires Basic auth credentials (apiKey + apiSecret)
 * Optional: useTestApi flag to use sandbox OAuth endpoint
 */
export const ExchangeAuthTokenRequestSchema = z.object({
    credentials: MPLCredentialsSchema.refine(
        (cred) => cred.authType === 'apiKey',
        { message: "exchangeAuthToken requires apiKey credentials, not oauth2 token" }
    ),
    options: z.object({
        useTestApi: z.boolean().optional(),
    }).optional(),
});

export type ExchangeAuthTokenRequest = z.infer<typeof ExchangeAuthTokenRequestSchema>;

/**
 * OAuth token response from MPL /oauth2/token endpoint
 */
export interface MPLOAuthTokenResponse {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;     // seconds (typically 3600)
    issued_at?: number;     // timestamp in ms (optional in response)
}

/**
 * Normalized response for exchangeAuthToken capability
 */
export interface ExchangeAuthTokenResponse {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;     // seconds
    issued_at?: number;     // timestamp in ms when token was issued
    raw: MPLOAuthTokenResponse;
}

/**
 * Types for the MPL fetchPickupPoints response
 * Returns either an array of pickup points (200 OK) or a gateway error (4xx/5xx)
 */
export type MPLPickupPointResponse = MPLAPIGatewayErrorResponse | MPLPickupPointEntry[];

/**
 * Single delivery place entry from the 200 response
 */
export interface MPLPickupPointEntry {
    deliveryplacesQueryResult: {
        deliveryplace: string;
        postCode: string;
        city: string;
        address: string;
        geocodeLat: number;
        geocodeLong: number;
        id: string;
        errors: MPLPickupPointEntryError[] | null;
    };
    servicePointType: PickupServicePointType[];
}

/**
 * Error details within a pickup point entry
 */
export interface MPLPickupPointEntryError {
    code: string;
    parameter: string;
    text: string;
    text_eng: string;
}

/**
 * Gateway error response structure
 * 
 * Returned for HTTP error statuses:
 * - 400 Bad request.           - Invalid request format or parameters.
 * - 401 Unauthorized.          - The provided access token is not valid.
 * - 403 Forbidden.             - The caller client is not configured to call the APIs published on the requested host:port.
 * - 404 Not found.             - The given path is not mapped to any valid path in the API Proxy.
 * - 429 Too many requests.     - Spike Arrest Fault or Quota Limit Fault. Check X-Quota-Reset, X-Quota-Allowed, X-Quota-Available response headers.
 * - 500 Internal server error. - An unexpected error occurred in the backend system.
 * - 503 Service unavailable.   - The backend service is unavailable for some reason.
 * 
 * Check the value of the X-Error-Source response header:
 * - If "Backend", the error was generated in the backend system.
 * - If "Gateway", the error was generated in the API Gateway.
 */
export interface MPLAPIGatewayErrorResponse {
    fault: {
        faultstring: string;
        detail: {
            errorcode: string;
        };
    };
}


/**
 * Helper functions to validate MPL adapter requests
 */

/**
 * Helper: validate credentials in one pass and get authType
 */
export function safeValidateCredentials(input: unknown) {
    return MPLCredentialsSchema.safeParse(input);
}

/**
 * Helper: validate full fetchPickupPoints request
 */
export function safeValidateFetchPickupPointsRequest(input: unknown) {
    return FetchPickupPointsMPLSchema.safeParse(input);
}

/**
 * Helper: validate exchangeAuthToken request
 */
export function safeValidateExchangeAuthTokenRequest(input: unknown) {
    return ExchangeAuthTokenRequestSchema.safeParse(input);
}

/**
 * Type guard: check if response is a gateway error
 */
export function isGatewayError(response: unknown): response is MPLAPIGatewayErrorResponse {
    return (
        response !== null &&
        typeof response === 'object' &&
        'fault' in response &&
        response.fault !== null &&
        typeof response.fault === 'object' &&
        'faultstring' in response.fault
    );
}

/**
 * Type guard: check if response is a successful 200 response
 * 
 * Strict validation: response MUST be an array of MPL pickup point entries.
 * Follows Foxpost pattern for consistency across adapters.
 */
export function isSuccessResponse(response: unknown): response is MPLPickupPointEntry[] {
     return Array.isArray(response);
}

// ===== SHIPMENT TYPES (CREATE_PARCEL capability) =====

/**
 * Basic service codes from OpenAPI
 * Represents available postal services
 */
export const BasicServiceCodeSchema = z.enum([
     'A_175_UZL', // Belföld alapszolgáltatás
     'A_177_MPC', // MPC - nagyobb térfogat
     'A_176_NET', // Nemzetközi express
     'A_176_NKP', // Nemzetközi kiegészítő
     'A_122_ECS', // Economy közép
     'A_121_CSG', // Csomag
     'A_13_EMS',  // Express Mail Service (International)
     'A_123_EUP', // Európa
     'A_123_HAR', // Közlekedési + Ajánlott Register
     'A_123_HAI', // Közlekedési + Ajánlott Ajánlott
     'A_125_HAR', // Csere-csomag HAR
     'A_125_HAI', // Csere-csomag HAI
]);
export type BasicServiceCode = z.infer<typeof BasicServiceCodeSchema>;

/**
 * Delivery modes from OpenAPI
 * HA  - Házhozszállítás (Home Delivery)
 * RA  - Raklapos Kézbesítés (Pallet Delivery)
 * PP  - PostaPont (Post Point)
 * CS  - Csomagautomata (Parcel Locker)
 * PM  - Postán Maradó (Post Office)
 */
export const DeliveryModeSchema = z.enum(['HA', 'RA', 'PP', 'CS', 'PM']);
export type DeliveryMode = z.infer<typeof DeliveryModeSchema>;

/**
 * Label type/format for address labels
 */
export const LabelTypeSchema = z.enum([
     'A4', 'A5', 'A5inA4', 'A5E', 'A5E_EXTRA', 'A5E_STAND', 'A6', 'A6inA4', 'A4ONE'
]);
export type LabelType = z.infer<typeof LabelTypeSchema>;

/**
 * Label file format
 */
export const LabelFormatSchema = z.enum(['PDF', 'ZPL']);
export type LabelFormat = z.infer<typeof LabelFormatSchema>;

/**
 * Package size enum
 */
export const PackageSizeSchema = z.enum(['S', 'M', 'L', 'PRINT', 'PACK']);
export type PackageSize = z.infer<typeof PackageSizeSchema>;

/**
 * Extra services codes (subset relevant for CREATE_SHIPMENT)
 * These are additional paid services that can be added to shipments
 */
export const ExtraServiceCodeSchema = z.enum([
     'K_ENY',  // Értéknyilvánítás (Value insurance)
     'K_TER',  // Terjedelmes kezelés (Bulky handling)
     'K_UVT',  // Árufizetés (Cash on delivery)
     'K_TOR',  // Törvényi
     'K_ORZ',  // Óvadék
     'K_IDO',  // Időablak (Time window)
     'K_RLC',  // Ragasz logikai csomag
     'K_TEV',  // Tevékenység
     'K_CSE',  // Csere-csomag alapcsomag
     'K_CSA',  // Csere-csomag inverz csomag
     'K_IDA',  // Időablak (delivery time window)
     'K_FNK',  // Fixed day delivery
]);
export type ExtraServiceCode = z.infer<typeof ExtraServiceCodeSchema>;

/**
 * Delivery time preference (for time window delivery)
 */
export const DeliveryTimeSchema = z.enum(['earlyMorning', 'morning', 'afternoon', 'evening']);
export type DeliveryTime = z.infer<typeof DeliveryTimeSchema>;

/**
 * UnitValue - weight/size with unit
 */
export const UnitValueSchema = z.object({
     value: z.number(),
     unit: z.enum(['kg', 'g']).optional(),
});
export type UnitValue = z.infer<typeof UnitValueSchema>;

/**
 * Contact information (name, organization, phone, email)
 */
export const ContactSchema = z.object({
     name: z.string().max(120).min(1),
     organization: z.string().max(120).optional(),
     phone: z.string().max(20).optional(),
     email: z.string().max(100).optional(),
});
export type Contact = z.infer<typeof ContactSchema>;

/**
 * Address information
 */
export const AddressSchema = z.object({
     postCode: z.string().length(4),
     city: z.string().max(35).min(2),
     address: z.string().max(60).min(3),
});
export type Address = z.infer<typeof AddressSchema>;

/**
 * Delivery address (same as regular address but includes optional parcelPickupSite)
 */
export const DeliveryAddressSchema = AddressSchema.extend({
     parcelPickupSite: z.string().max(100).optional(),
     countryCode: z.string().max(3).optional(),
});
export type DeliveryAddress = z.infer<typeof DeliveryAddressSchema>;

/**
 * Recipient information
 */
export const RecipientSchema = z.object({
     contact: ContactSchema,
     address: DeliveryAddressSchema,
     luaCode: z.string().max(20).optional(),
     disabled: z.boolean().optional(),
});
export type Recipient = z.infer<typeof RecipientSchema>;

/**
 * Sender information
 */
export const SenderSchema = z.object({
     agreement: z.string().length(8),
     accountNo: z.string().min(16).max(24).optional(),
     contact: ContactSchema,
     address: AddressSchema,
     parcelTerminal: z.boolean().optional(),
});
export type Sender = z.infer<typeof SenderSchema>;

/**
 * Service configuration for a shipment item
 */
export const ServiceSchema = z.object({
     basic: BasicServiceCodeSchema,
     deliveryMode: DeliveryModeSchema,
     extra: z.array(ExtraServiceCodeSchema).optional(),
     cod: z.number().optional(), // Cash on delivery amount in HUF
     value: z.number().int().optional(), // Value insurance amount in HUF
     codCurrency: z.string().max(3).optional(), // For international
     customsValue: z.number().optional(), // For international
});
export type Service = z.infer<typeof ServiceSchema>;

/**
 * Item/Parcel information
 */
export const ItemSchema = z.object({
     customData1: z.string().max(40).optional(),
     customData2: z.string().max(40).optional(),
     weight: UnitValueSchema.optional(),
     size: PackageSizeSchema.optional(),
     services: ServiceSchema,
     senderParcelPickupSite: z.string().max(100).optional(),
});
export type Item = z.infer<typeof ItemSchema>;

/**
 * Invoice information (optional, for billing)
 */
export const InvoiceSchema = z.object({
     name: z.string().max(150).min(1),
     postCode: z.string().length(4),
     city: z.string().max(35).min(2),
     address: z.string().max(60).min(3),
     vatIdentificationNumber: z.string().max(15).min(1),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

/**
 * Shipment creation request (maps to OpenAPI ShipmentCreateRequest)
 * This is ONE shipment that can contain multiple items (parcels)
 */
export const ShipmentCreateRequestSchema = z.object({
     developer: z.string().max(40).min(1),
     sender: SenderSchema,
     recipient: RecipientSchema,
     webshopId: z.string().max(100).min(1),
     orderId: z.string().max(50).optional(),
     shipmentDate: z.string().optional(), // date format
     labelType: LabelTypeSchema.optional(),
     labelFormat: LabelFormatSchema.optional(),
     tag: z.string().max(50).optional(),
     groupTogether: z.boolean().optional(),
     deliveryTime: DeliveryTimeSchema.optional(),
     deliveryDate: z.string().optional(), // date format
     item: z.array(ItemSchema).optional(),
     paymentMode: z.enum(['UV_AT', 'UV_KP']).optional(),
     packageRetention: z.number().int().optional(),
     printRecipientData: z.enum(['PRINTALL', 'PRINTPHONENUMBER', 'PRINTEMAIL', 'PRINTNOTHING']).optional(),
});
export type ShipmentCreateRequest = z.infer<typeof ShipmentCreateRequestSchema>;

/**
 * Replacement label information in response
 */
export const ReplacementLabelSchema = z.object({
     trackingNumber: z.string().optional(),
     label: z.string().optional(), // base64 encoded PDF
});
export type ReplacementLabel = z.infer<typeof ReplacementLabelSchema>;

/**
 * Error descriptor from MPL API
 */
export const ErrorDescriptorSchema = z.object({
     code: z.string().optional(),
     parameter: z.string().optional(),
     text: z.string().optional(),
     text_eng: z.string().optional(),
});
export type ErrorDescriptor = z.infer<typeof ErrorDescriptorSchema>;

/**
 * Warning descriptor from MPL API
 */
export const WarningDescriptorSchema = z.object({
     code: z.string().optional(),
     parameter: z.string().optional(),
     text: z.string().optional(),
     text_eng: z.string().optional(),
});
export type WarningDescriptor = z.infer<typeof WarningDescriptorSchema>;

/**
 * Shipment creation result (maps to OpenAPI ShipmentCreateResult)
 * Response for ONE shipment
 */
export const ShipmentCreateResultSchema = z.object({
     webshopId: z.string().optional(),
     trackingNumber: z.string().optional(),
     replacementTrackingNumber: z.string().optional(),
     replacementLabels: z.array(ReplacementLabelSchema).optional(),
     packageTrackingNumbers: z.array(z.string()).optional(),
     dispatchId: z.number().int().optional(),
     suggestedRecipientPostCode: z.string().optional(),
     suggestedRecipientCity: z.string().optional(),
     suggestedRecipientAddress: z.string().optional(),
     label: z.string().optional(), // base64 encoded PDF
     errors: z.array(ErrorDescriptorSchema).optional(),
     warnings: z.array(WarningDescriptorSchema).optional(),
});
export type ShipmentCreateResult = z.infer<typeof ShipmentCreateResultSchema>;

/**
 * Helper: validate shipment creation request
 */
export function safeValidateShipmentCreateRequest(input: unknown) {
     return ShipmentCreateRequestSchema.safeParse(input);
}

/**
 * Helper: validate shipment creation result
 */
export function safeValidateShipmentCreateResult(input: unknown) {
     return ShipmentCreateResultSchema.safeParse(input);
}

// ===== LABEL TYPES (CREATE_LABEL capability) =====

/**
 * Label order type from OpenAPI
 * SENDING - Order by sending sequence
 * IDENTIFIER - Order by tracking number identifier
 */
export const LabelOrderBySchema = z.enum(['SENDING', 'IDENTIFIER']);
export type LabelOrderBy = z.infer<typeof LabelOrderBySchema>;

/**
 * Single label query result from MPL API
 * Response for each tracking number requested
 */
export const LabelQueryResultSchema = z.object({
     trackingNumber: z.string().optional(),
     label: z.string().optional(),  // base64 encoded PDF/ZPL
     errors: z.array(ErrorDescriptorSchema).optional(),
     warnings: z.array(WarningDescriptorSchema).optional(),
});
export type LabelQueryResult = z.infer<typeof LabelQueryResultSchema>;

/**
 * Request for creating labels via GET /shipments/label
 * 
 * Required:
 * - parcelCarrierIds: array of tracking numbers
 * - credentials: MPLCredentials
 * - accountingCode: string
 * 
 * Optional:
 * - labelType: label format (default: A5)
 * - labelFormat: file format (default: PDF)
 * - orderBy: sorting order in PDF
 * - singleFile: combine all labels in single file
 */
export const CreateLabelsMPLRequestSchema = z.object({
     parcelCarrierIds: z.array(z.string().min(1)).min(1),
     credentials: MPLCredentialsSchema,
     accountingCode: z.string().min(1),
     options: z.object({
          useTestApi: z.boolean().optional(),
          labelType: LabelTypeSchema.optional(),
          labelFormat: LabelFormatSchema.optional(),
          orderBy: LabelOrderBySchema.optional(),
          singleFile: z.boolean().optional(),
     }).optional(),
});
export type CreateLabelsMPLRequest = z.infer<typeof CreateLabelsMPLRequestSchema>;

/**
 * Helper: validate label creation request
 */
export function safeValidateCreateLabelsRequest(input: unknown) {
     return CreateLabelsMPLRequestSchema.safeParse(input);
}
/**
 * Schema for GET_SHIPMENT_DETAILS request
 * Retrieves shipment metadata by tracking number
 */
export const GetShipmentDetailsRequestSchema = z.object({
     trackingNumber: z.string().min(1, 'trackingNumber is required'),
     credentials: MPLCredentialsSchema,
     options: z.object({
          useTestApi: z.boolean().optional(),
     }).optional(),
});
export type GetShipmentDetailsRequest = z.infer<typeof GetShipmentDetailsRequestSchema>;

/**
 * Helper: validate get shipment details request
 */
export function safeValidateGetShipmentDetailsRequest(input: unknown) {
     return GetShipmentDetailsRequestSchema.safeParse(input);
}

/**
 * Helper: validate shipment query response
 */
export function safeValidateShipmentQueryResponse(input: unknown) {
     return MPLShipmentQueryResultSchema.safeParse(input);
}

/**
 * Schema for Shipment query response
 * Response from GET /shipments/{trackingNumber}
 */
export const ShipmentStateSchema = z.object({
     trackingNumber: z.string().optional(),
     orderId: z.string().optional(),
     tag: z.string().optional(),
     shipmentDate: z.string().optional(),
     packageRetention: z.number().optional(),
     paymentMode: z.enum(['UV_AT', 'UV_KP']).optional(),
     sender: z.object({
          name: z.string().optional(),
          street: z.string().optional(),
          city: z.string().optional(),
          postalCode: z.string().optional(),
          country: z.string().optional(),
          phone: z.string().optional(),
     }).optional(),
     recipient: z.object({
          name: z.string().optional(),
          street: z.string().optional(),
          city: z.string().optional(),
          postalCode: z.string().optional(),
          country: z.string().optional(),
          phone: z.string().optional(),
     }).optional(),
     items: z.array(z.object({
          id: z.string().optional(),
          weight: z.number().optional(),
     }).passthrough()).optional(),
});
export type ShipmentState = z.infer<typeof ShipmentStateSchema>;

/**
 * Schema for the response from GET /shipments/{trackingNumber}
 */
export const MPLShipmentQueryResultSchema = z.object({
     shipment: ShipmentStateSchema.optional().nullable(),
     errors: z.array(ErrorDescriptorSchema).optional().nullable(),
     metadata: z.any().optional(),
});
export type MPLShipmentQueryResult = z.infer<typeof MPLShipmentQueryResultSchema>;

// ===== TRACKING TYPES (TRACK capability) =====

/**
 * Schema for tracking request (Pull-1 endpoint)
 * Retrieves tracking/trace information for one or more parcels
 * 
 * Required:
 * - trackingNumbers: array of one or more tracking numbers
 * - credentials: MPLCredentials
 * 
 * Optional:
 * - state: 'last' (latest event only, faster) or 'all' (complete history)
 * - useRegisteredEndpoint: false (Guest) or true (Registered with financial data)
 * - useTestApi: use sandbox API instead of production
 */
export const TrackingRequestMPLSchema = z.object({
  trackingNumbers: z.array(z.string().min(1)).min(1, 'At least one tracking number is required'),
  credentials: MPLCredentialsSchema,
  state: z.enum(['last', 'all']).optional().default('last'),
  useRegisteredEndpoint: z.boolean().optional().default(false),
  options: z.object({
    useTestApi: z.boolean().optional(),
  }).optional(),
});
export type TrackingRequestMPL = z.infer<typeof TrackingRequestMPLSchema>;

/**
 * Helper: validate tracking request
 */
export function safeValidateTrackingRequest(input: unknown) {
  return TrackingRequestMPLSchema.safeParse(input);
}

/**
 * MPL C-Code Tracking Record from Pull-1 API response
 * 
 * Contains C0-C63 fields representing different tracking data.
 * Guest endpoint excludes financial data (C2, C5, C41, C42, C58)
 * Registered endpoint includes all fields
 */
export const MPLTrackingRecordSchema = z.object({
  c0: z.string().optional(),   // System ID
  c1: z.string(),               // Consignment ID (Tracking number) - REQUIRED
  c2: z.string().optional(),    // Service Code (Registered only)
  c4: z.string().optional(),    // Delivery Mode
  c5: z.string().optional(),    // Weight (Registered only)
  c6: z.string().optional(),    // Service Description
  c8: z.string().optional(),    // Location
  c9: z.string().optional(),    // Last Event Status (CRITICAL)
  c10: z.string().optional(),   // Timestamp
  c11: z.string().optional(),   // Location Details
  c12: z.string().optional(),   // Event Description
  c13: z.string().optional(),   // Event Notes
  c38: z.string().optional(),   // Service Name
  c39: z.string().optional(),   // Service Details
  c41: z.string().optional(),   // Size Length (Registered only)
  c42: z.string().optional(),   // Size Width (Registered only)
  c43: z.string().optional(),   // Size Height
  c49: z.string().optional(),   // Destination
  c53: z.string().optional(),   // Signature/Receiver
  c55: z.string().optional(),   // Insurance flag
  c56: z.string().optional(),   // COD flag
  c57: z.string().optional(),   // Signature required flag
  c59: z.string().optional(),   // Additional flag 1
  c60: z.string().optional(),   // Additional flag 2
  c61: z.string().optional(),   // Additional flag 3
  c63: z.string().optional(),   // Custom/Reference data
}).passthrough();  // Allow additional fields
export type MPLTrackingRecord = z.infer<typeof MPLTrackingRecordSchema>;

/**
 * Schema for tracking response from Pull-1 API
 * Returns array of tracking records (one per tracking number) or error
 */
export const TrackingResponseMPLSchema = z.object({
  trackAndTrace: z.array(MPLTrackingRecordSchema).optional(),
}).passthrough();
export type TrackingResponseMPL = z.infer<typeof TrackingResponseMPLSchema>;

/**
 * Helper: validate tracking response
 */
export function safeValidateTrackingResponse(input: unknown) {
  return TrackingResponseMPLSchema.safeParse(input);
}

// ===== PULL-500 BATCH TRACKING TYPES =====

/**
 * Schema for Pull-500 start request (batch tracking submission)
 * 
 * Required:
 * - trackingNumbers: array of 1-500 tracking numbers
 * - credentials: MPLCredentials
 * 
 * Optional:
 * - language: 'hu' (Hungarian, default) or 'en' (English)
 * - useTestApi: use sandbox API
 */
export const Pull500StartRequestSchema = z.object({
  trackingNumbers: z.array(z.string().min(1)).min(1).max(500, 'Maximum 500 tracking numbers allowed'),
  credentials: MPLCredentialsSchema,
  language: z.enum(['hu', 'en']).default('hu').optional(),
  options: z.object({
    useTestApi: z.boolean().optional(),
  }).optional(),
});
export type Pull500StartRequest = z.infer<typeof Pull500StartRequestSchema>;

/**
 * Helper: validate Pull-500 start request
 */
export function safeValidatePull500StartRequest(input: unknown) {
  return Pull500StartRequestSchema.safeParse(input);
}

/**
 * Schema for Pull-500 start response
 * Returns trackingGUID for polling, plus any submission errors
 */
export const Pull500StartResponseSchema = z.object({
  trackingGUID: z.string().min(1),
  errors: z.array(ErrorDescriptorSchema).optional(),
}).passthrough();
export type Pull500StartResponse = z.infer<typeof Pull500StartResponseSchema>;

/**
 * Helper: validate Pull-500 start response
 */
export function safeValidatePull500StartResponse(input: unknown) {
  return Pull500StartResponseSchema.safeParse(input);
}

/**
 * Schema for Pull-500 check request (poll for results)
 * 
 * Required:
 * - trackingGUID: UUID returned from start request
 * - credentials: MPLCredentials
 */
export const Pull500CheckRequestSchema = z.object({
  trackingGUID: z.string().min(1, 'trackingGUID is required'),
  credentials: MPLCredentialsSchema,
  options: z.object({
    useTestApi: z.boolean().optional(),
  }).optional(),
});
export type Pull500CheckRequest = z.infer<typeof Pull500CheckRequestSchema>;

/**
 * Helper: validate Pull-500 check request
 */
export function safeValidatePull500CheckRequest(input: unknown) {
  return Pull500CheckRequestSchema.safeParse(input);
}

/**
 * Status values for Pull-500 check response
 * NEW - Request received, queued
 * INPROGRESS - Processing
 * READY - Results available
 * ERROR - Processing failed
 */
export const Pull500StatusSchema = z.enum(['NEW', 'INPROGRESS', 'READY', 'ERROR']);
export type Pull500Status = z.infer<typeof Pull500StatusSchema>;

/**
 * Schema for Pull-500 check response
 * 
 * Status progression: NEW -> INPROGRESS -> READY (or ERROR)
 * When status=READY, report contains CSV-formatted tracking data
 * report_fields contains column headers
 */
export const Pull500CheckResponseSchema = z.object({
  status: Pull500StatusSchema,
  report: z.string().optional(),        // CSV-formatted data (when status=READY)
  report_fields: z.string().optional(), // CSV header (when status=READY)
  errors: z.array(ErrorDescriptorSchema).optional(),
}).passthrough();
export type Pull500CheckResponse = z.infer<typeof Pull500CheckResponseSchema>;

/**
 * Helper: validate Pull-500 check response
 */
export function safeValidatePull500CheckResponse(input: unknown) {
  return Pull500CheckResponseSchema.safeParse(input);
}
