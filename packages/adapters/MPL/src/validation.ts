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
});

const OAuthBranch = z.object({
    authType: z.literal('oauth2'),
    oAuth2Token: z.string().min(1),
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
    postCode: z.string().length(4).optional(),
    city: z.string().optional(),
    servicePointType: PickupServicePointTypeSchema.optional(),
    options: z.object({
        useTestApi: z.boolean().optional(),
    }).optional(),
});

export type FetchPickupPointsMPLRequest = z.infer<typeof FetchPickupPointsMPLSchema>;

/**
 * Types for the MPL fetchPickupPoints response
 * Union of either a 200 OK response or a gateway error (4xx/5xx)
 */
export type MPLPickupPointResponse = MPLAPIGatewayErrorResponse | MPLPickupPointResponse200;

/**
 * 200 OK response structure
 */
export interface MPLPickupPointResponse200 {
    deliveryplaces: MPLPickupPointEntry[];
}

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
 */
export function isSuccessResponse(response: unknown): response is MPLPickupPointResponse200 {
    return (
        response !== null &&
        typeof response === 'object' &&
        'deliveryplaces' in response &&
        Array.isArray((response as any).deliveryplaces)
    );
}