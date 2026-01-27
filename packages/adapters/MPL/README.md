# @shopickup/adapters-mpl

Shopickup adapter for **MPL** - a major Hungarian logistics carrier providing parcel delivery and pickup services.

## Features

## State of Implementation

The following table shows what API endpoints and features of the Foxpost API have or have not been implemented in this adapter yet:

| Endpoint / Feature                  | Description                          | Implemented  | Details                                                           |
|-------------------------------------|--------------------------------------|--------------|-------------------------------------------------------------------|
| POST/addresses/cityToZipCode        | Get Zip Codes by City                | 🗓️ No        | Not implemented yet, planned                                      |
| POST/addresses/zipCodeToCity        | Get City by Zip Code                 | 🗓️ No        | Not implemented yet, planned                                      |
| POST/deliveryplace                  | Get Pickup Locations                 | 🗓️ No        | Not implemented yet, planned                                      |
| POST/reports                        | Report on Disp. Packages             | ❌ No        | Not planned; nieche feature                                       |
| POST/shipments                      | Submission of Parcel Data            | 🗓️ No        | Not implemented yet, planned                                      |
| GET/shipments                       | Get Details of Shipments             | 🗓️ No        | Not implemented yet, planned                                      |
| POST/shipments{trackingNumber}/item | Add Package to Separate Consignment  | ❌ No        | Not planned; custom barcodes are niche                            |
| GET/shipments/label                 | Query Address Label of Parcel(s)     | 🗓️ No        | Not implemented yet, planned                                      |
| GET/shipments/{trackingNumber}      | Query Item through Tracking Number   | 🗓️ No        | Not implemented yet, planned                                      |
| DELETE/shipments/{trackingNumber}   | Delete Item through Tracking Number  | 🗓️ No        | Not implemented yet, planned                                      |
| POST/shipments/close                | Request Closing List + Delivery Note | 🗓️ No        | Not implemented yet, planned                                      |
| PULL 1 Tracking /registered         | Get Detailed Tracking Information    | 🗓️ No        | Not implemented yet, planned                                      |
| PULL 1 Tracking /guest              | Get Tracking Information             | 🗓️ No        | Not implemented yet, planned                                      |
| POST 500 Trackings /tracking        | Bulk Detailed Tracking Information   | 🗓️ No        | Not implemented yet, planned                                      |
| GET 500 /tracking/{trackingGUID}    | Bulk Tracking Information            | 🗓️ No        | Not implemented yet, planned                                      |

## Authentication

Authentication is possible directly via basic auth of `Basic <base64 encoded apiKey:apiSecret>`, or by first exchanging these same credetials for a bearer token via the `https://core.api.posta.hu/oauth2/token` endpoint.

If you use the basic auth method without first allowing it in the MPL system you will receive an authentication error such as:

```
{
    status: 401
    statusText: "Unauthorized"
    body: {
        "fault": {
            "faultstring": "Basic authentication is not enabled for this proxy or client.",
            "detail": {
                "errorcode": "RaiseFault.BasicAuthNotEnabled"
            }
        }
    }
    error: "Request failed with status code 401"
}
```

```
7.3.3 Példa üzenet  
Példa kérés a HTTP header-ben. 
Bearer típusú kérést az OAuth2 authorizációs típus esetében kell szerepeltetni, Basic típusú kérést 
pedig a Basic authorizációs típus esetében 
Paraméter Érték   
Authorization  Bearer APRug5AE4VGAzNKDPAoxugLiDp0b 
Authorization  Basic Q2xpZW50SWRUaGF0Q2FuT25seVJlYWQ6c2VjcmV0MQ== 
Táblázat 6– Példa HTTP fejléc értékek az API kérés üzenetben 
  
7.4  OAuth2 token kérés 
OAuth2 authorizáció használata esetében token-t kell kérni az üzleti hívások előtt. 
7.4.1 Kérés üzenet  
URL: https://core.api.posta.hu/oauth2/token 
http művelet: POST  
 
A kérést az alábbi módon kell megadni:  
A HTTP header-ben egy szabványos Basic authentikáció kéréssel az Authorization key értéket kell 
megadni. 
Pld: Authorization: Basic Q2xpZW50SWRUaGF0Q2FuT25seVJlYWQ6c2VjcmV0MQ== 
• base64 enkódolt (API felhasználónév  (API Key) : API account jelszó (API Secret)) 
az üzenet body-ban 
• OAuth2 grant type key értéket kell megadni client_credentials value értékkel az üzenet body 
szekcióban 
  
Paraméter  Hossz  Előfordulás  Adat 
típus  
Leírás 
client_id N/A  1-1  String  Kötelező. A felhasználónevet az MPL API 
biztosítja.  
client_secret  N/A  1-1  String  Kötelező. A jelszót az MPL API biztosítja. 
2020.10.20   21 - 119  V1.1  
  
grant_type  N/A  1-1  String  Kötelező.  
Értéke: client_credentials 
Az üzenet Body szekcióban kell megadni. 
  Táblázat 7 –Token kérés üzenet  
A http header paraméterek között szerepeltetni kell a  
Content-Type:application/x-www-form-urlencoded  
paramétert az Authorization key érték mellett. 
 
7.4.2 Válasz üzenet  
A válasz üzenet body-ja tartalmazza az authorizációs token-t. A sikeres válasz esetében HTTP 200 
(Ok) válasz kódot kapunk.  
  
Mező   Max. 
hossz  
Előfordulás  Adat 
típus  
Leírás 
access_token  N/A  1-1  String  Authorizációs token  
expires_in N/A  1-1  String  Token lejárata (másodpercben) 3600 másodperc 
Táblázat 8 –Token válasz üzenet releváns mezők 
 
Az authorizációs token lejárata 3600 másodperc. Miután lejár az érvényessége, felhasználása után 
401-es http kódot kapunk a válasz üzenetben. Ekkor új tokent kell igényelni a fenti leírt módon.  
7.4.3 Példa üzenet  
  
Token Kérés  
  
POST http://localhost:17463/oauth2/token HTTP/1.1  
Content-Type: application/x-www-form-urlencoded 
Authorization: Basic Q2xpZW50SWRUaGF0Q2FuT25seVJlYWQ6c2VjcmV0MQ== 
 
grant_type=client_credentials 
  
  
 
 
 
 
2020.10.20   22 - 119  V1.1  
Token Válasz  
  
HTTP/1.1 200 OK  
Content-Type: application/json  
 
{
  "access_token": "APRug5AE4VGAzNKDPAoxugLiDp0b",
  "issued_at": 1592910455065,
  "expires_in": 1799,
  "token_type": "Bearer"
}
```

## Using the `exchangeAuthToken` Capability

The MPL adapter includes the `EXCHANGE_AUTH_TOKEN` capability for explicit OAuth token exchange. This is useful when:

- Basic auth is disabled at your MPL account level
- You want to cache OAuth tokens to reduce network calls
- You need explicit control over token lifecycle

### Usage in Code

```typescript
import { MPLAdapter } from '@shopickup/adapters-mpl';
import { createAxiosHttpClient } from '@shopickup/core/http/axios-client';

const adapter = new MPLAdapter();
const httpClient = createAxiosHttpClient();

// Exchange credentials for OAuth token
const result = await adapter.exchangeAuthToken(
  {
    credentials: {
      apiKey: 'your-api-key',
      apiSecret: 'your-api-secret',
    },
    options: {
      useTestApi: false,  // Use production endpoint
    },
  },
  {
    http: httpClient,
    logger: console,
  }
);

// Result contains:
// - access_token: "APRug5AE4VGAzNKDPAoxugLiDp0b"
// - token_type: "Bearer"
// - expires_in: 1799 (seconds)
// - issued_at: 1592910455065 (timestamp in ms)

// Store the token for later use
const bearerToken = result.access_token;

// Use token for subsequent API calls
const ctx = {
  http: httpClient,
  logger: console,
  credentials: {
    authType: 'oauth2',
    oAuth2Token: bearerToken,
  },
};

// Now make API calls with the cached token
const pickupPoints = await adapter.fetchPickupPoints(
  { /* request */ },
  ctx
);
```

### Testing with Postman

To test the auth endpoint with Postman, use the following setup:

**URL:** `http://localhost:3000/api/dev/mpl/exchange-auth-token`

**Method:** `POST`

**Headers:**
- `Content-Type: application/json`

**Body (raw JSON):**
```json
{
  "credentials": {
    "apiKey": "your-api-key",
    "apiSecret": "your-api-secret"
  },
  "options": {
    "useTestApi": true
  }
}
```

**Important:** Make sure you're sending `Content-Type: application/json` header. In Postman:
1. Click the "Body" tab
2. Select "raw" option
3. From the dropdown, choose "JSON" (this auto-sets the Content-Type header)
4. Paste the JSON payload above

**Success Response (200):**
```json
{
  "access_token": "APRug5AE4VGAzNKDPAoxugLiDp0b",
  "token_type": "Bearer",
  "expires_in": 1799,
  "issued_at": 1592910455065,
  "raw": { ... }
}
```

**Error Responses:**

If Basic auth is disabled (401):
```json
{
  "message": "OAuth token exchange failed: Basic authentication is not enabled for this proxy or client. (RaiseFault.BasicAuthNotEnabled)",
  "category": "Auth",
  "raw": { ... }
}
```

If credentials are invalid (400):
```json
{
  "message": "Invalid request: credentials.apiKey: Required; credentials.apiSecret: Required",
  "category": "Validation",
  "validationContext": "body"
}
```

### HTTP Client Automatic Fallback with `withOAuthFallback`

**Reference Implementation of Retry Mechanism Wrapper**

When Basic auth is disabled at your MPL account level, the `withOAuthFallback` wrapper automatically handles OAuth fallback transparently. This is a **reference implementation** showing how to build a retry mechanism wrapper. Integrators are free to:

- Use this wrapper directly as-is
- Adapt it as a base for custom retry logic
- Implement their own alternative solutions

#### How It Works

The wrapper intercepts HTTP requests and automatically:

1. **Detects 401 "Basic auth disabled" errors** - Checks for the specific `RaiseFault.BasicAuthNotEnabled` error code
2. **Exchanges credentials for OAuth token** - Uses `exchangeAuthToken` capability with correct test/production endpoint
3. **Caches the token** - With 30-second expiry buffer to minimize token exchanges
4. **Retries the original request** - With new Bearer token, replacing original Basic auth
5. **Returns the successful response** - Transparent to caller, request succeeds without retry visibility

#### Key Features

- **Transparent retries** - No client code changes needed; retry happens inside wrapper
- **Test/Production awareness** - Respects `useTestApi` flag for correct OAuth endpoint selection
- **Token caching** - Reduces OAuth exchanges during token lifetime
- **Fail-fast on second 401** - Won't loop; only one OAuth exchange attempt per request
- **Structured logging** - Logs all OAuth fallback steps with `[OAuth Fallback]` prefix

#### Usage

```typescript
import { createAxiosHttpClient } from '@shopickup/core/http/axios-client';
import { withOAuthFallback, createResolveOAuthUrl } from '@shopickup/adapters-mpl';
import { MPLAdapter } from '@shopickup/adapters-mpl';

const adapter = new MPLAdapter();
const baseHttpClient = createAxiosHttpClient();

// Create OAuth URL resolver for test vs. production
const resolveOAuthUrl = createResolveOAuthUrl(
  'https://core.api.posta.hu/oauth2/token',      // Production
  'https://sandbox.api.posta.hu/oauth2/token'    // Test/Sandbox
);

// Wrap HTTP client with OAuth fallback
const wrappedHttpClient = withOAuthFallback(
  baseHttpClient,
  {
    authType: 'apiKey',
    apiKey: 'your-api-key',
    apiSecret: 'your-api-secret',
  },
  'YOUR_ACCOUNTING_CODE',
  resolveOAuthUrl,
  console,           // Optional logger
  true               // useTestApi: true for sandbox, false for production
);

// Use wrapped HTTP client in adapter context
const ctx = {
  http: wrappedHttpClient,
  logger: console,
};

// Make API calls - OAuth fallback happens transparently
const pickupPoints = await adapter.fetchPickupPoints(
  {
    accountingCode: 'YOUR_ACCOUNTING_CODE',
    postCode: '',
    city: '',
    servicePointType: [],
    options: { useTestApi: true },
  },
  ctx
);

// If Basic auth is disabled:
// 1. Initial request gets 401 "Basic auth not enabled"
// 2. Wrapper exchanges credentials for OAuth token
// 3. Wrapper retries with Bearer token
// 4. Response returned successfully
// All transparent to this code!
```

#### Implementing Your Own Retry Wrapper

To build your own retry mechanism wrapper, follow this pattern:

```typescript
import type { HttpClient, HttpResponse, HttpClientConfig } from '@shopickup/core';

export function withYourCustomRetry(baseHttpClient: HttpClient): HttpClient {
  return {
    async post<T>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> {
      try {
        // Try the original request
        return await baseHttpClient.post<T>(url, data, config);
      } catch (err) {
        // Check if error is your specific retry condition
        if (shouldRetry(err)) {
          // Implement your custom recovery logic
          const recoveryData = await performRecovery(err);
          
          // Retry with recovered state
          return await baseHttpClient.post<T>(url, data, {
            ...config,
            headers: {
              ...config?.headers,
              ...recoveryData.headers,  // Updated headers
            },
          });
        }
        
        // Re-throw non-retry errors
        throw err;
      }
    },
    // Implement other methods (get, put, patch, delete) similarly
    async get<T>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>> { /* ... */ },
    async put<T>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> { /* ... */ },
    async patch<T>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>> { /* ... */ },
    async delete<T>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>> { /* ... */ },
  };
}
```

**Key Points for Custom Implementations:**

1. **Wrap all HTTP methods** - `get`, `post`, `put`, `patch`, `delete`
2. **Handle response.data for errors** - Axios wraps errors in `HttpError` with `response.data`
3. **Spread config.headers first** - Then override with new headers to ensure your changes take precedence
4. **Fail-fast on repeated errors** - Avoid infinite loops; track retry state and don't retry twice
5. **Log recovery steps** - Help integrators debug retry behavior
6. **Return consistent types** - Always return `HttpResponse<T>`

#### Example: Dev Server Integration

The dev server includes an example of using `withOAuthFallback`:

```
POST /api/dev/mpl/pickup-points-oauth-fallback
```

Request:
```json
{
  "credentials": {
    "apiKey": "sandbox-key",
    "apiSecret": "sandbox-secret"
  },
  "accountingCode": "0020300734",
  "postCode": "",
  "city": "",
  "options": {
    "useTestApi": true
  }
}
```

Response (200 on success):
```json
{
  "points": [
    {
      "id": "MP001",
      "name": "Main Post Office",
      "latitude": 47.4979,
      "longitude": 19.0402,
      "address": { /* ... */ },
      "pickupAllowed": true,
      "dropoffAllowed": true
    }
  ],
  "summary": { "totalCount": 1 }
}
```

If Basic auth is disabled, the wrapper automatically handles the OAuth fallback internally.

#### Important Notes

- **This is a reference implementation** - Not required for use. Integrators can implement their own solutions.
- **Single retry only** - Wrapper doesn't chain retries; it attempts one OAuth exchange and fails if that fails
- **Token caching is local** - In-memory only; each wrapper instance has its own cache. For distributed systems, consider external token storage
- **Error handling** - All errors (OAuth exchange, second-attempt 401, etc.) are wrapped in `CarrierError` with appropriate category
- **Logging control** - Pass `logger` parameter for debugging; logs have `[OAuth Fallback]` prefix for easy filtering
