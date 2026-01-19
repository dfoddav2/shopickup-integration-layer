# ADAPTER_DEVELOPMENT.md — Step-by-Step Carrier Integration Guide

> **Updated January 2025** — Reflects current ESM/NodeNext build system, Vitest testing, and production-ready Foxpost adapter.

This guide walks you through adding a new shipping carrier adapter to Shopickup. By the end, you'll have a publishable npm package that integrates seamlessly with the core library.

## Prerequisites

- Node.js 18+ (v20 recommended)
- pnpm 8+
- TypeScript familiarity
- Understanding of the carrier's REST API (or access to documentation)
- Familiarity with ESM (import/export syntax)

## Overview

Adding a carrier involves these steps:

1. **Define the OpenAPI spec** — Document the carrier's API
2. **Generate TypeScript types** — From OpenAPI → types only
3. **Implement the adapter** — Map canonical ↔ carrier types
4. **Write tests** — Contract, unit, and integration tests
5. **Publish** — npm publish to make it available

Estimated time: 2-4 hours for a simple carrier, 8+ hours for complex ones.

---

## Step 1: Define the OpenAPI Specification

### Why OpenAPI?

OpenAPI serves as:

- **Single source of truth** for the carrier's API
- **Input to codegen** (generates TypeScript types)
- **Input to mock server** (Prism) for contract testing
- **Documentation** for future maintainers

### Create the Spec File

Create `carrier-docs/canonical/<carrier>.yaml` (annotated version):

```yaml
openapi: 3.0.0
info:
  title: Foxpost Carrier API
  version: "1.0.0"
  description: Hungarian postal carrier API
  x-capabilities:
    - CREATE_SHIPMENT
    - CREATE_PARCEL
    - CLOSE_SHIPMENT
    - CREATE_LABEL
  x-requires:
    createLabel:
      - CLOSE_SHIPMENT  # Must call closeShipment() before createLabel()

servers:
  - url: https://api.foxpost.hu/v1

paths:
  /shipments:
    post:
      operationId: createShipment
      x-capability: CREATE_SHIPMENT
      summary: Create a new shipment
      tags:
        - Shipments
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateShipmentRequest"
      responses:
        "201":
          description: Shipment created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Shipment"
        "400":
          description: Invalid input
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"

  /shipments/{shipmentId}/parcels:
    post:
      operationId: createParcel
      x-capability: CREATE_PARCEL
      parameters:
        - name: shipmentId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateParcelRequest"
      responses:
        "201":
          description: Parcel created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Parcel"

  /shipments/{shipmentId}/close:
    post:
      operationId: closeShipment
      x-capability: CLOSE_SHIPMENT
      parameters:
        - name: shipmentId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Shipment closed
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Shipment"

  /parcels/{parcelId}/label:
    post:
      operationId: createLabel
      x-capability: CREATE_LABEL
      parameters:
        - name: parcelId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateLabelRequest"
      responses:
        "200":
          description: Label generated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Label"

components:
  schemas:
    CreateShipmentRequest:
      type: object
      required:
        - referenceNumber
        - sender
        - recipient
        - weight
      properties:
        referenceNumber:
          type: string
          description: Customer reference (e.g., order ID)
        sender:
          $ref: "#/components/schemas/Address"
        recipient:
          $ref: "#/components/schemas/Address"
        weight:
          type: number
          description: Weight in grams
        service:
          type: string
          enum: [STANDARD, EXPRESS]

    Address:
      type: object
      required:
        - name
        - street
        - city
        - postalCode
        - country
      properties:
        name:
          type: string
        street:
          type: string
        city:
          type: string
        postalCode:
          type: string
        country:
          type: string
          description: ISO 3166-1 alpha-2

    Shipment:
      type: object
      properties:
        id:
          type: string
        status:
          type: string
        createdAt:
          type: string
          format: date-time

    CreateParcelRequest:
      type: object
      required:
        - weight
      properties:
        weight:
          type: number

    Parcel:
      type: object
      properties:
        id:
          type: string
        weight:
          type: number
        status:
          type: string

    CreateLabelRequest:
      type: object
      properties:
        format:
          type: string
          enum: [PDF, ZPL]
          default: PDF

    Label:
      type: object
      properties:
        id:
          type: string
        trackingNumber:
          type: string
        pdfUrl:
          type: string
        createdAt:
          type: string
          format: date-time

    Error:
      type: object
      properties:
        code:
          type: string
        message:
          type: string
```

### Best Practices for OpenAPI

1. **Include `x-capabilities`** at the top level — lists what this carrier supports.
2. **Include `x-requires`** if operations have dependencies (e.g., must close before label).
3. **Use `operationId`** for method names — should match adapter method names.
4. **Add descriptions** — helpful for maintainers.
5. **Include error schemas** — document error responses (400, 401, 429, 5xx).
6. **Keep it realistic** — schemas should match what the carrier actually returns.

---

## Step 2: Generate TypeScript Types

### Run Codegen

```bash
# Install openapi-typescript globally or use pnpm
pnpm add -D openapi-typescript

# Generate types
npx openapi-typescript carrier-docs/canonical/foxpost.yaml \
  --output packages/adapters/foxpost/gen/index.ts
```

### Output Structure

`packages/adapters/foxpost/gen/index.ts` will contain:

```typescript
export interface paths {
  "/shipments": {
    post: operations["createShipment"];
  };
  "/shipments/{shipmentId}/parcels": {
    post: operations["createParcel"];
  };
  // ... etc
}

export interface operations {
  createShipment: {
    requestBody: { content: { "application/json": CreateShipmentRequest } };
    responses: {
      "201": { content: { "application/json": Shipment } };
      "400": { content: { "application/json": Error } };
    };
  };
  // ... etc
}

export interface CreateShipmentRequest {
  referenceNumber: string;
  sender: Address;
  recipient: Address;
  weight: number;
  service?: "STANDARD" | "EXPRESS";
}

export interface Address {
  name: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

// ... etc
```

### Setup pnpm Script

Add to `packages/adapters/foxpost/package.json`:

```json
{
  "scripts": {
    "codegen": "openapi-typescript ../../carrier-docs/canonical/foxpost.yaml --output gen/index.ts"
  }
}
```

Then run: `pnpm --filter=@shopickup/adapters-foxpost codegen`

---

## Step 3: Create the Adapter Package Structure

### Directory Layout

```bash
mkdir -p packages/adapters/foxpost/src/tests
mkdir -p packages/adapters/foxpost/gen
```

### Create package.json

`packages/adapters/foxpost/package.json`:

```json
{
  "name": "@shopickup/adapters-foxpost",
  "version": "1.0.0",
  "description": "Foxpost shipping carrier adapter for Shopickup",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./stores": "./dist/stores/index.js"
  },
  "scripts": {
    "build": "tsc",
    "codegen": "openapi-typescript ../../carrier-docs/canonical/foxpost.yaml --output gen/index.ts"
  },
  "peerDependencies": {
    "@shopickup/core": "^1.0.0"
  },
  "devDependencies": {
    "@shopickup/core": "workspace:*",
    "@stoplight/prism-http": "^5.0.0",
    "openapi-typescript": "^6.0.0",
    "typescript": "^5.0.0"
  },
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

**Note:** Tests are run from the monorepo root with `pnpm run test`, not from the adapter package.

### Create tsconfig.json

`packages/adapters/foxpost/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## Step 3b: Understanding Request Options

Request objects (e.g., `CreateParcelRequest`, `RatesRequest`, `PickupRequest`) can include an optional `options` property for per-call behavior modifications.

### Available Options

```typescript
export interface RequestOptions {
  /**
   * Use test/sandbox API endpoint instead of production
   * Some carriers have separate test APIs (e.g., Foxpost: webapi-test.foxpost.hu)
   * Default: false
   */
  useTestApi?: boolean;

  /**
   * Custom options for future extensibility
   */
  [key: string]: unknown;
}
```

### Using Options in Your Adapter

#### 1. For methods with request objects (createParcel, createShipment, etc.)

Read `req.options?.useTestApi` and use it to determine which endpoint to call:

```typescript
async createParcel(
  shipmentCarrierId: string,
  req: CreateParcelRequest,
  ctx: AdapterContext
): Promise<CarrierResource> {
  // Check if test mode requested
  const useTest = req.options?.useTestApi ?? false;
  const baseUrl = useTest ? "https://api-test.example.com" : "https://api.example.com";
  
  // Make request to appropriate endpoint
  const res = await ctx.http!.post(`${baseUrl}/parcels`, payload);
  
  ctx.logger?.debug("Creating parcel", { testMode: useTest, ... });
  
  return { carrierId: res.id, status: "created", raw: res };
}
```

#### 2. For methods without request objects (track, createLabel, voidLabel)

Since these methods only receive `AdapterContext`, extend the context type to read options:

```typescript
async track(
  trackingNumber: string,
  ctx: AdapterContext
): Promise<TrackingUpdate> {
  // Cast to any to access options (this is a known limitation)
  const useTest = (ctx as any)?.options?.useTestApi ?? false;
  const baseUrl = useTest ? "https://api-test.example.com" : "https://api.example.com";
  
  const res = await ctx.http!.get(`${baseUrl}/tracking/${trackingNumber}`);
  
  ctx.logger?.debug("Tracking parcel", { testMode: useTest, ... });
  
  return mapFromCarrier.tracking(res);
}
```

### Declaring TEST_MODE_SUPPORTED

If your adapter supports test mode, add `TEST_MODE_SUPPORTED` to your capabilities:

```typescript
export class YourAdapter implements CarrierAdapter {
  readonly id = "your-carrier";
  readonly capabilities: Capability[] = [
    "CREATE_PARCEL",
    "CREATE_LABEL",
    "TRACK",
    "TEST_MODE_SUPPORTED",  // ← Advertise test mode support
  ];
  
  // ... rest of implementation
}
```

This allows orchestrators to discover that your adapter supports `useTestApi`.

### Example: Using Options in Tests

```typescript
// Test production endpoint (default)
await adapter.createParcel(
  "s1",
  {
    shipment: testShipment,
    parcel: testParcel,
    credentials: { apiKey: "prod-key" },
    options: { useTestApi: false }
  },
  context
);

// Test sandbox endpoint
await adapter.createParcel(
  "s1",
  {
    shipment: testShipment,
    parcel: testParcel,
    credentials: { apiKey: "test-key" },
    options: { useTestApi: true }  // ← Use test endpoint
  },
  context
);
```

---

## Step 4: Implement the Adapter

### Create src/index.ts

```typescript
import {
  CarrierAdapter,
  Capability,
  CarrierResource,
  AdapterContext,
  CarrierError,
} from "@shopickup/core";
import { FoxpostClient } from "./client.js";
import { mapToFoxpost, mapFromFoxpost } from "./mapper.js";
import type { CreateShipmentRequest, CreateParcelRequest } from "./types.js";

/**
 * Foxpost Adapter
 *
 * Supports shipment creation, parcel creation, closing, and label generation.
 * Note: Foxpost requires closing a shipment before generating labels.
 */
export class FoxpostAdapter implements CarrierAdapter {
  readonly id = "foxpost";
  readonly displayName = "Foxpost";
  readonly capabilities: Capability[] = [
    "CREATE_SHIPMENT",
    "CREATE_PARCEL",
    "CLOSE_SHIPMENT",
    "CREATE_LABEL",
  ];

  readonly requires = {
    createLabel: ["CLOSE_SHIPMENT"], // Must close before label
  };

  private client: FoxpostClient;

  constructor(private baseUrl: string) {
    this.client = new FoxpostClient(baseUrl);
  }

  configure(opts: { baseUrl?: string }): void {
    if (opts.baseUrl) {
      this.baseUrl = opts.baseUrl;
      this.client = new FoxpostClient(opts.baseUrl);
    }
  }

  async createShipment(
    req: CreateShipmentRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource> {
    try {
      ctx.logger?.debug("Creating shipment", {
        referenceNumber: req.shipment.id,
      });

      const payload = mapToFoxpost.createShipment(req.shipment);
      const res = await ctx.http!.post("/shipments", payload);

      ctx.logger?.info("Shipment created", { carrierId: res.id });

      return {
        carrierId: res.id,
        status: "created",
        raw: res,
      };
    } catch (err) {
      return this.handleError(err, "createShipment");
    }
  }

  async createParcel(
    shipmentCarrierId: string,
    req: CreateParcelRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource> {
    try {
      ctx.logger?.debug("Creating parcel", {
        shipmentId: shipmentCarrierId,
        weight: req.parcel.weight,
      });

      const payload = mapToFoxpost.createParcel(req.parcel);
      const res = await ctx.http!.post(
        `/shipments/${shipmentCarrierId}/parcels`,
        payload
      );

      ctx.logger?.info("Parcel created", { parcelId: res.id });

      return {
        carrierId: res.id,
        status: "created",
        raw: res,
      };
    } catch (err) {
      return this.handleError(err, "createParcel");
    }
  }

  async closeShipment(
    shipmentCarrierId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource> {
    try {
      ctx.logger?.debug("Closing shipment", { shipmentId: shipmentCarrierId });

      const res = await ctx.http!.post(`/shipments/${shipmentCarrierId}/close`);

      ctx.logger?.info("Shipment closed", { shipmentId: shipmentCarrierId });

      return {
        carrierId: res.id,
        status: "closed",
        raw: res,
      };
    } catch (err) {
      return this.handleError(err, "closeShipment");
    }
  }

  async createLabel(
    parcelCarrierId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource & { labelUrl?: string | null }> {
    try {
      ctx.logger?.debug("Creating label", { parcelId: parcelCarrierId });

      const res = await ctx.http!.post(
        `/parcels/${parcelCarrierId}/label`,
        { format: "PDF" }
      );

      ctx.logger?.info("Label created", {
        trackingNumber: res.trackingNumber,
      });

      return {
        carrierId: res.id,
        status: "created",
        labelUrl: res.pdfUrl ?? null,
        raw: res,
      };
    } catch (err) {
      return this.handleError(err, "createLabel");
    }
  }

  private handleError(err: unknown, operation: string): never {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 400) {
        throw new CarrierError(
          `Validation error in ${operation}: ${data?.message ?? "unknown"}`,
          "Validation",
          { carrierCode: data?.code, raw: data }
        );
      } else if (status === 401 || status === 403) {
        throw new CarrierError("API credentials invalid", "Auth", {
          raw: data,
        });
      } else if (status === 429) {
        throw new CarrierError("Rate limit exceeded", "RateLimit", {
          retryAfterMs: parseInt(
            err.response?.headers["retry-after"] ?? "60000"
          ),
          raw: data,
        });
      } else if (status && status >= 500) {
        throw new CarrierError("Carrier service error", "Transient", {
          raw: data,
        });
      }
    }

    throw new CarrierError(
      `Unexpected error in ${operation}: ${err instanceof Error ? err.message : String(err)}`,
      "Permanent",
      { raw: err }
    );
  }
}

export * from "./types";
```

### Create src/client.ts (Thin Wrapper)

```typescript
/**
 * Thin wrapper around Foxpost HTTP API.
 * Mostly a pass-through; actual HTTP logic is in adapter methods via ctx.http.
 */
export class FoxpostClient {
  constructor(private baseUrl: string) {}

  // Optional: helper methods for common patterns
  // Most logic stays in the adapter itself
}
```

### Create src/mapper.ts

```typescript
import type { Shipment, Parcel } from "@shopickup/core";
import type {
  CreateShipmentRequest as FoxpostShipmentRequest,
  CreateParcelRequest as FoxpostParcelRequest,
  Address as FoxpostAddress,
} from "./types.js";

/**
 * Maps canonical Shopickup types to Foxpost API types.
 */
export const mapToFoxpost = {
  createShipment(shipment: Shipment): FoxpostShipmentRequest {
    return {
      referenceNumber: shipment.id,
      sender: mapToFoxpost.address(shipment.sender),
      recipient: mapToFoxpost.address(shipment.recipient),
      weight: shipment.totalWeight,
      service: mapServiceCode(shipment.service),
    };
  },

  createParcel(parcel: Parcel): FoxpostParcelRequest {
    return {
      weight: parcel.weight,
      // Add other fields as needed
    };
  },

  address(addr: Shopickup.Address): FoxpostAddress {
    return {
      name: addr.name,
      street: addr.street,
      city: addr.city,
      postalCode: addr.postalCode,
      country: addr.country, // Foxpost expects ISO 3166-1 alpha-2
    };
  },
};

/**
 * Maps Foxpost API types back to canonical Shopickup types.
 */
export const mapFromFoxpost = {
  trackingEvent(event: any): TrackingEvent {
    return {
      timestamp: new Date(event.timestamp),
      status: mapStatusCode(event.status),
      description: event.description || "",
      location: event.location,
      raw: event,
    };
  },
};

/**
 * Helper: Map canonical service code to Foxpost service code.
 */
function mapServiceCode(
  service: "standard" | "express" | "economy" | "overnight"
): string {
  const mapping = {
    standard: "STANDARD",
    express: "EXPRESS",
    economy: "STANDARD",
    overnight: "EXPRESS",
  };
  return mapping[service] || "STANDARD";
}

/**
 * Helper: Map Foxpost status to canonical status.
 */
function mapStatusCode(status: string): TrackingEvent["status"] {
  const mapping: Record<string, TrackingEvent["status"]> = {
    CREATED: "PENDING",
    PICKED_UP: "IN_TRANSIT",
    IN_DELIVERY: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    EXCEPTION: "EXCEPTION",
    RETURNED: "RETURNED",
  };
  return mapping[status] || "PENDING";
}
```

### Create src/types.ts

```typescript
/**
 * Re-exports generated types from OpenAPI.
 */
export * from "../gen/index.js";

/**
 * Optional: define additional types that aren't in OpenAPI.
 */
// e.g., internal mapper helpers
```

---

## Step 5: Write Tests

Tests are run from the monorepo root using **Vitest**. Place test files alongside source code or in a `tests/` directory.

> **Note:** Tests run against compiled code in `dist/`. Run `pnpm run build` before testing.

### Create src/tests/contract.spec.ts

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { start as startMockServer } from "@stoplight/prism-http";
import axios from "axios";
import { FoxpostAdapter } from "../index.js";

describe("FoxpostAdapter - Contract Tests", () => {
  let mockServer: any;
  let adapter: FoxpostAdapter;
  const httpClient = axios;

  beforeAll(async () => {
    mockServer = await startMockServer({
      document: "../../../carrier-docs/canonical/foxpost.yaml",
      port: 3456,
    });
    adapter = new FoxpostAdapter("http://localhost:3456");
  });

  afterAll(async () => {
    if (mockServer) await mockServer.close();
  });

  it("should create a shipment", async () => {
    const result = await adapter.createShipment!(
      {
        shipment: {
          id: "ship-1",
          sender: {
            name: "John Doe",
            street: "123 Main",
            city: "Budapest",
            postalCode: "1011",
            country: "HU",
          },
          recipient: {
            name: "Jane Smith",
            street: "456 Oak",
            city: "Budapest",
            postalCode: "1012",
            country: "HU",
          },
          service: "standard",
          totalWeight: 1000,
        },
        credentials: { apiKey: "test-key" },
      },
      { http: httpClient, logger: console }
    );

    expect(result.carrierId).toBeDefined();
    expect(result.status).toBe("created");
  });

  it("should throw validation error for invalid shipment", async () => {
    await expect(
      adapter.createShipment!(
        {
          shipment: {
            id: "ship-1",
            // Missing required fields
            sender: { name: "" } as any,
            recipient: { name: "" } as any,
            service: "standard",
            totalWeight: -1, // Invalid
          },
          credentials: { apiKey: "test-key" },
        },
        { http: httpClient }
      )
    ).rejects.toThrow();
  });
});
```

### Create src/tests/mapper.spec.ts

```typescript
import { describe, it, expect } from "vitest";
import { mapToFoxpost } from "../mapper.js";
import type { Shipment } from "@shopickup/core";

describe("Foxpost Mapper", () => {
  it("should map canonical shipment to Foxpost format", () => {
    const shipment: Shipment = {
      id: "ship-1",
      sender: {
        name: "Sender Co",
        street: "123 Main St",
        city: "Budapest",
        postalCode: "1011",
        country: "HU",
      },
      recipient: {
        name: "Recipient Inc",
        street: "456 Oak Ave",
        city: "Budapest",
        postalCode: "1012",
        country: "HU",
      },
      service: "express",
      totalWeight: 2500,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const foxpost = mapToFoxpost.createShipment(shipment);

    expect(foxpost.referenceNumber).toBe("ship-1");
    expect(foxpost.sender.name).toBe("Sender Co");
    expect(foxpost.weight).toBe(2500);
    expect(foxpost.service).toBe("EXPRESS");
  });
});
```

### Test Configuration

Tests are configured at the monorepo root in `vitest.config.ts`. Individual adapters don't need their own test config.

**To run tests:**

```bash
# Run all tests (monorepo)
pnpm run test

# Run tests for one adapter (watch mode)
pnpm run test -- --project foxpost

# Run with coverage
pnpm run test:coverage
```

**Key differences from Jest:**

- Import `describe`, `it`, `expect` from `vitest` (globals enabled)
- No need for `.js` extensions in imports from outside compiled packages
- Same API as Jest, so migration is straightforward

---

## Step 6: Build & Test

**Important:** This project uses a build-first workflow. TypeScript is compiled to `dist/`, and tests run against compiled code.

```bash
# From monorepo root, build everything
pnpm run build

# Run all tests (monorepo)
pnpm run test

# Run tests with coverage
pnpm run test:coverage

# Watch mode (rebuild + retest on file changes)
pnpm run test -- --watch
```

**Build-first workflow benefits:**

- Catches import path errors at compile time (via TypeScript)
- Tests run against actual compiled output (same as production)
- Faster iteration with watch mode

**If build fails:**

1. Check TypeScript errors: `pnpm run build`
2. Verify all imports use `.js` extensions (ESM requirement)
3. Ensure tsconfig.json extends root config properly

**If tests fail:**

1. Check that source code was built: `ls dist/`
2. Verify test files import from `../index.js` (compiled code)
3. Run a single test: `pnpm run test -- mapper.spec.ts`

---

## Step 7: Publish

### Update Version

Edit `packages/adapters/foxpost/package.json`:

```json
{
  "version": "1.0.0"
}
```

### Create README.md

`packages/adapters/foxpost/README.md`:

```markdown
# @shopickup/adapters-foxpost

Foxpost shipping carrier adapter for Shopickup.

## Installation

```bash
npm install @shopickup/adapters-foxpost @shopickup/core
```

## Usage

```typescript
import { FoxpostAdapter } from "@shopickup/adapters-foxpost";
import { executeCreateLabelFlow } from "@shopickup/core";

const adapter = new FoxpostAdapter("https://api.foxpost.hu/v1");

const result = await executeCreateLabelFlow({
  adapter,
  shipment: myShipment,
  parcels: [myParcel],
  credentials: { apiKey: process.env.FOXPOST_KEY },
  context: { http: httpClient },
});

console.log(result.labelResources[0].labelUrl);
```

## Supported Capabilities

- `CREATE_SHIPMENT` — Create a shipment
- `CREATE_PARCEL` — Add parcels to a shipment
- `CLOSE_SHIPMENT` — Close a shipment (required before labeling)
- `CREATE_LABEL` — Generate a label

## Carrier-Specific Notes

- **Must close before labeling:** Foxpost requires `closeShipment()` to be called before `createLabel()`.
- **Service codes:** `standard` and `express` are supported; others default to `standard`.
- **Address validation:** Foxpost validates postcode format per country.

## Error Handling

The adapter throws `CarrierError` with categories:

- `Validation` — Invalid input (400)
- `Auth` — Invalid API key (401)
- `RateLimit` — Too many requests (429)
- `Transient` — Server error, network timeout (retryable)
- `Permanent` — Unrecoverable errors

See `@shopickup/core` documentation for retry strategies.

```

### Publish to npm

```bash
# Authenticate to npm (if not already)
npm login

# Publish
npm publish --access public
```

---

## Verification Checklist

- [ ] OpenAPI spec at `carrier-docs/canonical/<carrier>.yaml` with `x-capabilities`
- [ ] Types generated in `gen/index.ts`
- [ ] `src/index.ts` implements `CarrierAdapter` interface with ESM exports
- [ ] `src/mapper.ts` handles bidirectional mapping
- [ ] `src/client.ts` (even if minimal)
- [ ] Test files in `src/tests/` with `.spec.ts` suffix
- [ ] `src/tests/contract.spec.ts` tests against mock server
- [ ] `src/tests/mapper.spec.ts` tests mapping functions
- [ ] All imports use `.js` extensions (ESM)
- [ ] `pnpm run build` completes successfully
- [ ] `pnpm run test` passes all tests
- [ ] `package.json` with `type: "module"` and peerDependency on `@shopickup/core`
- [ ] `tsconfig.json` extends root config, sets `noEmit: false`, `declaration: true`
- [ ] `README.md` with usage and carrier-specific notes
- [ ] Published to npm (optional for internal use)

---

## Troubleshooting

### Prism Mock Server Won't Start

```bash
# Ensure Prism is installed
npm list @stoplight/prism-http

# Check OpenAPI spec is valid
npx spectral lint carrier-docs/canonical/<carrier>.yaml
```

### Codegen Produces Confusing Types

- Add more detailed schemas to OpenAPI spec
- Use `description` fields to clarify intended types
- Consider manually fixing generated types if necessary

### Tests Failing

1. Check carrier API documentation for correct field names
2. Verify OpenAPI spec matches actual carrier API
3. Use mock server's built-in request logging: start Prism with `--verbose`

---

## Next Steps

After publishing:

1. **Register in core:** Add to any adapter registry/discovery if you implemented one
2. **Create example:** Add example usage to `examples/` directory
3. **Document quirks:** Update carrier-specific notes in README as you discover edge cases
4. **Gather feedback:** Open issues for integrators to report problems

Happy adapting! 🚀
