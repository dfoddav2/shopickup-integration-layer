/**
 * MPL HTTP Client Utilities
 * Thin utilities for building MPL API requests
 */

import { randomUUID } from 'crypto';
import type { MPLCredentials } from '../validation.js';

/**
 * Build standard MPL auth headers
 * Supports both OAuth2 Bearer token and API Key authentication
 * Uses "Authorization" header with appropriate scheme
 * 
 * @param credentials MPL credentials (OAuth2 or API Key)
 * @param accountingCode Customer code provided by Magyar Posta Zrt.
 * @param requestId Optional GUID for request tracking; auto-generated if omitted
 * @returns Headers object with Authorization, Content-Type, X-Accounting-Code, and X-Request-ID
 */
export function buildMPLHeaders(
    credentials: MPLCredentials,
    accountingCode: string,
    requestId?: string
): Record<string, string> {
    const authType = credentials.authType;
    const guid = requestId || randomUUID();

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    // Add X-Request-ID (required by MPL API)
    headers["X-Request-ID"] = guid;

    // Add X-Accounting-Code if provided
    if (accountingCode) {
        headers["X-Accounting-Code"] = accountingCode;
    }

    // Add Authorization header based on auth type
    if (authType === 'oauth2') {
        const { oAuth2Token } = credentials;
        headers["Authorization"] = `Bearer ${oAuth2Token}`;
    } else if (authType === 'apiKey') {
        const { apiKey, apiSecret } = credentials;
        const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
        headers["Authorization"] = `Basic ${basicAuth}`;
    } else {
        // This should never happen due to type safety, but added for completeness
        throw new Error(`Unsupported MPL auth type: ${authType}`);
    }

    return headers;
}
