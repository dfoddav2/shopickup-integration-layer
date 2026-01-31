# GLS Adapter Integration Testing Guide

## Overview

This guide provides instructions for testing the GLS adapter against the live GLS MyGLS API using real credentials. This is necessary to validate that the PascalCase JSON key conversion actually resolves authentication issues.

**Current Status**: ✅ Unit tests all pass (84/84). Ready for integration testing with real GLS credentials.

**Branch**: `test/gls-pascalcase-auth` - Contains PascalCase conversion and debug logging for authentication testing.

---

## Background: The PascalCase Investigation

### Problem
The adapter was receiving persistent 401 Unauthorized errors from the GLS API despite implementing correct authentication (SHA512 hashing, JSON body format).

### Root Cause Hypothesis
The official GLS PHP example (`php_rest_client.php`) uses **PascalCase** JSON keys:
```json
{
  "Username": "...",
  "Password": [...],
  "ClientNumberList": [...],
  "ParcelList": [...]
}
```

Our adapter was sending **camelCase** keys:
```json
{
  "username": "...",
  "password": [...],
  "clientNumberList": [...],
  "parcelList": [...]
}
```

The GLS API may be case-sensitive for JSON key validation, causing authentication failures.

### Solution Implemented
- Created `convertToPascalCase()` utility to recursively convert object keys
- Applied conversion to all API requests (PrepareLabels, PrintLabels, GetParcelStatuses)
- Added debug logging to verify request structure
- **Important**: This is non-breaking - all unit tests still pass because they validate functionality, not key casing

---

## Testing Methods

Choose one or more methods below to test the fix:

### Method 1: Manual cURL Test (Fastest, Immediate Feedback)

**Best for**: Quick validation without running code

#### Prerequisites
- `curl` installed (macOS, Linux)
- GLS test credentials (username, password, client number)

#### Steps

1. **Generate SHA512 password hash as byte array**:
   ```bash
   node -e "
   const crypto = require('crypto');
   const password = 'YOUR_GLS_PASSWORD';
   const hash = crypto.createHash('sha512').update(password).digest();
   const bytes = [];
   for (let i = 0; i < hash.length; i++) bytes.push(hash[i]);
   console.log(JSON.stringify(bytes));
   "
   ```
   Save the output - this is your `PASSWORD_ARRAY`

2. **Make test request with cURL**:
   ```bash
   curl -X POST https://api.test.mygls.hu/ParcelService.svc/json/PrepareLabels \
     -H "Content-Type: application/json" \
     -d '{
       "Username": "YOUR_EMAIL@EXAMPLE.COM",
       "Password": [PASSWORD_ARRAY_HERE],
       "ClientNumberList": [YOUR_CLIENT_NUMBER],
       "WebshopEngine": "test",
       "ParcelList": [
         {
           "Reference": "TEST-001",
           "CODAmount": 0,
           "ServiceCode": 10,
           "SenderAddress": {
             "Name": "Test Sender",
             "Street": "Main St",
             "HouseNumber": "1",
             "ZipCode": "1012",
             "City": "Budapest",
             "Country": "HU"
           },
           "RecipientAddress": {
             "Name": "Test Recipient",
             "Street": "Main St",
             "HouseNumber": "5",
             "ZipCode": "4025",
             "City": "Debrecen",
             "Country": "HU"
           },
           "Parcel": {
             "Weight": 500
           }
         }
       ]
     }' \
     -v
   ```

3. **Interpret response**:
   - ✅ **200 OK**: Success! Check response for `ParcelInfoList` with parcel IDs
   - ❌ **401 Unauthorized**: Authentication still failing - PascalCase didn't fix it
   - 🔍 **400 Bad Request**: Request format issue (check JSON structure)
   - 🔍 **500 Server Error**: GLS API error (see response body)

---

### Method 2: Dev Server Integration Test (Comprehensive, Real Code)

**Best for**: Testing within your application

#### Prerequisites
- Git checkout on `test/gls-pascalcase-auth` branch
- GLS test credentials
- Node.js 18+

#### Setup

1. **Start development server**:
   ```bash
   npm run dev
   ```

2. **Create test file** (`test-gls-integration.js`):
   ```javascript
   import { GLSAdapter } from '@shopickup/adapters-gls';
   import { createAxiosHttpClient } from '@shopickup/core/http';

   const adapter = new GLSAdapter();
   const httpClient = createAxiosHttpClient();

   async function testGLSAuth() {
     try {
       // Test with minimal parcel
       const result = await adapter.createParcels(
         {
           parcels: [
             {
               id: 'TEST-001',
               shipper: {
                 contact: { name: 'Test Sender', phone: '+36123456', email: 'test@example.com' },
                 address: { street: 'Main St 1', city: 'Budapest', postalCode: '1012', country: 'HU' }
               },
               recipient: {
                 contact: { name: 'Test Recipient', phone: '+36987654', email: 'test@example.com' },
                 delivery: {
                   method: 'HOME',
                   address: { street: 'Main St 5', city: 'Debrecen', postalCode: '4025', country: 'HU' }
                 }
               },
               package: { weightGrams: 500 },
               service: 'standard'
             }
           ],
           credentials: {
             username: process.env.GLS_USERNAME,
             password: process.env.GLS_PASSWORD,
             clientNumberList: [parseInt(process.env.GLS_CLIENT_NUMBER)],
             webshopEngine: 'integration-test/1.0'
           },
           options: { country: 'HU', useTestApi: true }
         },
         {
           http: httpClient,
           logger: console  // Shows debug logs
         }
       );

       console.log('✅ SUCCESS:', result);
       return true;
     } catch (err) {
       console.error('❌ FAILED:', err.message);
       if (err.details?.raw) {
         console.error('Details:', err.details.raw);
       }
       return false;
     }
   }

   // Run test
   const success = await testGLSAuth();
   process.exit(success ? 0 : 1);
   ```

3. **Set environment variables**:
   ```bash
   export GLS_USERNAME="your.email@example.com"
   export GLS_PASSWORD="your-password"
   export GLS_CLIENT_NUMBER="100000001"
   ```

4. **Run test**:
   ```bash
   node test-gls-integration.js
   ```

5. **Monitor debug output** for:
   - `GLS: Creating parcels batch` - Request preparation
   - `GLS: Request payload (PascalCase test)` - Shows request keys (should be PascalCase)
   - `GLS: Response received` - Shows HTTP status and response preview

#### Expected Output (Success)

```
GLS: Creating parcels batch {
  count: 1,
  country: 'HU',
  testMode: true
}

GLS: Request payload (PascalCase test) {
  url: 'https://api.test.mygls.hu/ParcelService.svc/json/PrepareLabels',
  requestKeys: ['Username', 'Password', 'ClientNumberList', 'WebshopEngine', 'ParcelList'],
  hasUsername: true,
  hasPassword: true,
  passwordLength: 64,
  clientNumberList: [100000001],
  parcelCount: 1
}

GLS: Response received {
  statusCode: 200,
  hasBody: true,
  bodyKeys: ['ParcelInfoList', 'GLSErrorList'],
  bodyPreview: '{"ParcelInfoList":[{"ClientNumber":100000001,"Reference":"TEST-001",...'
}

✅ SUCCESS: {
  results: [{
    carrierId: '...',
    reference: 'TEST-001',
    ...
  }],
  successCount: 1,
  failureCount: 0,
  allSucceeded: true
}
```

---

### Method 3: Formal Unit Integration Test

**Best for**: Automated testing, CI/CD integration

#### Setup

Create file `packages/adapters/GLS/src/tests/integration.spec.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { GLSAdapter } from '../index.js';
import { createAxiosHttpClient } from '@shopickup/core/http';
import { CreateParcelsRequest } from '@shopickup/core';

describe('GLS Integration Tests (Real API)', () => {
  let adapter: GLSAdapter;
  let httpClient: ReturnType<typeof createAxiosHttpClient>;
  let credentials: any;

  beforeAll(() => {
    // Check for required env vars
    const username = process.env.GLS_USERNAME;
    const password = process.env.GLS_PASSWORD;
    const clientNumber = process.env.GLS_CLIENT_NUMBER;

    if (!username || !password || !clientNumber) {
      console.log(
        'Skipping integration tests - set GLS_USERNAME, GLS_PASSWORD, GLS_CLIENT_NUMBER'
      );
      expect(true).toBe(true); // Skip test
      return;
    }

    adapter = new GLSAdapter();
    httpClient = createAxiosHttpClient();
    credentials = {
      username,
      password,
      clientNumberList: [parseInt(clientNumber)],
      webshopEngine: 'integration-test/1.0'
    };
  });

  it.skipIf(!process.env.GLS_USERNAME)(
    'should create parcel with PascalCase authentication',
    async () => {
      const req: CreateParcelsRequest = {
        parcels: [
          {
            id: `TEST-${Date.now()}`,
            shipper: {
              contact: {
                name: 'Test Sender',
                phone: '+36123456789',
                email: 'test@example.com'
              },
              address: {
                street: 'Main Street',
                number: '1',
                city: 'Budapest',
                postalCode: '1012',
                country: 'HU'
              }
            },
            recipient: {
              contact: {
                name: 'Test Recipient',
                phone: '+36987654321',
                email: 'recipient@example.com'
              },
              delivery: {
                method: 'HOME',
                address: {
                  street: 'Side Street',
                  number: '5',
                  city: 'Debrecen',
                  postalCode: '4025',
                  country: 'HU'
                }
              }
            },
            package: { weightGrams: 500 },
            service: 'standard'
          }
        ],
        credentials,
        options: { country: 'HU', useTestApi: true }
      };

      const result = await adapter.createParcels(req, {
        http: httpClient,
        logger: console
      });

      // Assertions
      expect(result).toBeDefined();
      expect(result.successCount).toBeGreaterThan(0);
      expect(result.results[0].carrierId).toBeDefined();
      expect(result.results[0].carrierId).toMatch(/^[0-9]+$/); // Numeric parcel ID
    }
  );
});
```

#### Run

```bash
# Set credentials
export GLS_USERNAME="your.email@example.com"
export GLS_PASSWORD="your-password"
export GLS_CLIENT_NUMBER="100000001"

# Run tests
npm test -- --run packages/adapters/GLS/src/tests/integration.spec.ts
```

---

## What to Look For

### Success Indicators ✅

1. **HTTP 200 response** from GLS API
2. **Response contains `ParcelInfoList`** with created parcel IDs
3. **Debug logs show PascalCase keys**:
   - `Username`, `Password`, `ClientNumberList`, `WebshopEngine`, `ParcelList`
4. **No `GLSErrorList`** or errors in response
5. **Parcel ID format** matches GLS numeric IDs

### Failure Indicators ❌

1. **HTTP 401 Unauthorized** - Authentication still failing
   - Check credentials are correct
   - Verify password byte array is correct (64 elements)
   - May indicate different root cause than key casing

2. **HTTP 400 Bad Request** - JSON format issue
   - Check key casing (should be PascalCase)
   - Verify all required fields present
   - Check array vs object types

3. **HTTP 500 Server Error** - GLS API error
   - Check response body for error message
   - May indicate invalid parcel data or account issue

4. **Debug logs show camelCase keys**:
   - `username`, `password`, `clientNumberList` (wrong)
   - Means conversion didn't apply - check code

### Anomalies to Investigate 🔍

1. **401 still occurs** → Root cause is NOT key casing
   - May be: HTTP Basic Auth header required, wrong endpoint, account permissions
   - Check GLS API documentation
   - Compare request headers with PHP example

2. **Different error code** → Different validation issue
   - 400: Parcel format, missing fields, invalid data
   - 403: Permissions issue
   - 404: Wrong endpoint or region
   - 429: Rate limiting
   - 5xx: GLS service issue

3. **Partial failures** → Mixed results
   - Check which parcels succeeded/failed
   - Look for common patterns (e.g., all invalid service codes)
   - Review error details in response

---

## Debugging Tips

### 1. Enable Maximum Logging

```javascript
const ctx = {
  http: httpClient,
  logger: {
    log: (...args) => console.log('[LOG]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
  }
};
```

### 2. Inspect Actual HTTP Request

If using Axios, add interceptor:

```javascript
const httpClient = createAxiosHttpClient();
const axiosInstance = httpClient as any;

axiosInstance.interceptors.request.use(config => {
  console.log('📤 Request:', {
    method: config.method?.toUpperCase(),
    url: config.url,
    headers: config.headers,
    data: config.data ? JSON.stringify(config.data, null, 2) : 'none'
  });
  return config;
});

axiosInstance.interceptors.response.use(
  response => {
    console.log('📥 Response:', {
      status: response.status,
      headers: response.headers,
      data: response.data
    });
    return response;
  },
  error => {
    console.error('❌ Error Response:', {
      status: error.response?.status,
      data: error.response?.data
    });
    throw error;
  }
);
```

### 3. Compare with PHP Example

Review the official GLS PHP client (`php_rest_client.php`):
- Check exact request structure
- Verify key names (case-sensitive)
- Compare password encoding (should be byte array)
- Note any headers or request properties we might be missing

### 4. Test with Different Credentials

If available, test with:
- Different user account (might have different permissions)
- Different client number (might have regional differences)
- Different webshopEngine identifier

---

## Success Scenarios

### Scenario 1: PascalCase Fixes Auth ✅

**Expected Result**: HTTP 200 with parcel creation successful

**Next Steps**:
1. Run Method 2 (Dev Server) and Method 3 (Unit Test) to confirm
2. Document findings in git commit
3. Consider merging to main: `git checkout main && git merge test/gls-pascalcase-auth`
4. Update documentation with confirmed fix
5. Release new adapter version

### Scenario 2: PascalCase Doesn't Help ❌

**Expected Result**: Still getting HTTP 401

**Investigation Needed**:
1. Compare request headers with PHP example
   - May need to add custom headers
   - May need to remove certain headers
2. Check if HTTP Basic Auth header required
   - GLS spec says JSON body, but maybe older endpoint differs
   - Test with `Authorization: Basic base64(email:password)` header
3. Verify password byte array format
   - Hash length: must be exactly 64 bytes (512 bits)
   - Each element must be 0-255 integer
   - No hex encoding or other format

**Alternative Hypotheses**:
- GLS endpoint might require specific User-Agent header
- Account might need activation/verification in MyGLS
- Test API might have different authentication flow than production
- GLS might validate request size or other envelope properties

### Scenario 3: Different Error (400, 500, etc.)

**Expected Result**: Error code other than 401

**Diagnosis**:
1. Parse error message from response body
2. Check parcel data against GLS requirements:
   - Service codes valid for country
   - Address fields complete
   - Weight and dimensions within limits
   - Required fields present
3. Check account permissions:
   - Can account create parcels?
   - Can account use specific service codes?
   - Are there usage limits or quotas?

---

## Recording Results

When you test, please record:

1. **Test Method Used**: cURL, Dev Server, or Unit Test
2. **Credentials**: (mask sensitive data)
   - Username: your.email@example.com
   - Client Number: 100000001
   - Test Mode: Yes
3. **HTTP Status Code**: e.g., 200, 401, 400, 500
4. **Request Structure**: Keys seen in debug logs
5. **Response Body**: Error message or success indication
6. **Overall Result**: Success/Failure and conclusion

**Example Result Template**:
```
Test Date: 2024-01-15
Test Method: Dev Server (Method 2)
Username: test@mygls.hu
Client: 100000001
Test Mode: Yes (api.test.mygls.hu)

HTTP Status: 200
Request Keys: [Username, Password, ClientNumberList, WebshopEngine, ParcelList]
Password Array Length: 64 ✓
Response Contains: ParcelInfoList
First Parcel ID: 123456789

Result: ✅ SUCCESS - PascalCase fix works!
Conclusion: Merge to main and release
```

---

## After Testing

### If Successful ✅

1. **Document findings** in this file
2. **Commit results**:
   ```bash
   git add packages/adapters/GLS/INTEGRATION_TESTING.md
   git commit -m "docs(gls): document successful PascalCase authentication test"
   ```
3. **Merge to main**:
   ```bash
   git checkout main
   git merge test/gls-pascalcase-auth
   ```
4. **Tag release**:
   ```bash
   npm version patch
   git push origin main --tags
   ```

### If Unsuccessful ❌

1. **Create issue** documenting findings
2. **Revert changes** if needed:
   ```bash
   git checkout main
   ```
3. **Continue investigation** with alternative hypotheses
4. **Update this guide** with learnings

---

## Contact & Support

- GLS API Support: https://www.gls-group.eu
- Shopickup Issues: See project documentation
- Community Discussions: (if applicable)

