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

### HTTP Client Automatic Fallback

When the HTTP client receives a 401 "Basic auth disabled" error, it can automatically exchange credentials for an OAuth token and retry the request. This is handled by the `withOAuthFallback` HTTP client wrapper (optional enhancement).
