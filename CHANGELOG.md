# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-01-22

### Added

- **New core types for richer domain modeling:**
  - `Money`: Structured monetary amounts with ISO 4217 currency codes
  - `Contact`: Decoupled contact information (name, phone, email, company)
  - `Delivery`: Discriminated union for HOME (full address) vs PICKUP_POINT (locker/shop) delivery

- **Redesigned Parcel interface:**
  - `shipper`: Nested `{ contact, address }` structure (required in core, adapters document if ignored)
  - `recipient`: Nested with delivery method discriminator for compile-time type safety
  - `package`: Nested `{ weightGrams, dimensionsCm }` (was flat `weight`)
  - `handling`: Carrier-agnostic flags (fragile, perishables, battery type)
  - `cod`, `declaredValue`, `insurance`: Structured with `Money` type
  - `references`: Nested for organization
  - Eliminates metadata hacks for common shipping concepts

- **Comprehensive validation layer in Foxpost adapter:**
  - Zod schemas for all canonical types and Foxpost-specific types
  - Multi-layer validation: incoming parcel → mapped carrier payload (catches mapping bugs early)
  - Discriminated union validation for HD vs APM parcels

- **APM (Automated Parcel Machine) support in Foxpost adapter:**
  - `mapParcelToFoxpost()` reads delivery discriminator
  - Conditional address fields: HOME includes full address; APM includes destination field
  - Validates mapped carrier-specific payloads before API calls

- **Comprehensive test coverage for new delivery discriminator:**
  - 7 new mapper unit tests for APM payload mapping
  - 3 new integration tests: HOME delivery, APM delivery, batch mixed HD+APM
  - Mock HTTP client enhancement for batch responses with unique barcodes

### Changed

- **BREAKING:** `Parcel` interface completely redesigned
  - `weight` field replaced with `package.weightGrams`
  - `sender`/`recipient` flattened; now structured with nested contact/address
  - `recipient` now includes delivery discriminator (`delivery.method` and conditional fields)
  - Integrators must update code to use new structure

- **Foxpost adapter mapper updated:**
  - `mapParcelToFoxpost()` now handles both HOME and PICKUP_POINT delivery methods
  - Returns payload with optional `destination` field for APM deliveries
  - Address fields conditionally omitted for APM (only recipient name/phone/email + destination)

- **README.md expanded:**
  - Added "New Parcel Structure" section explaining design decisions
  - Documented Delivery discriminated union pattern
  - Clarified why shipper is required in core

### Fixed

- N/A (initial redesign, no prior releases)

### Documentation

- Added CHANGELOG.md (this file)
- Updated README.md with new Parcel structure documentation
- Foxpost adapter JSDoc clarified that shipper is required in core but not sent to API
 - Dev-server default logging level changed to `info` to reduce verbose output from pickup-point feeds; documented in examples/dev-server/README.md

### Test Results

- **Total tests:** 47 passed (up from 41)
- **Mapper tests:** 18 (up from 11) - added 7 APM-specific tests
- **Integration tests:** 17 (up from 14) - added 3 discriminator tests
- **All builds succeed:** @shopickup/core, @shopickup/adapters-foxpost, example dev-server

### Migration Guide

If upgrading from pre-2.0, update your Parcel objects:

**Before:**
```typescript
const parcel: Parcel = {
  id: 'p1',
  sender: { name: '...', street: '...', city: '...' },
  recipient: { name: '...', street: '...', city: '...' },
  weight: 1000,
  reference: 'ORD-123',
};
```

**After:**
```typescript
const parcel: Parcel = {
  id: 'p1',
  shipper: {
    contact: { name: 'Sender Corp' },
    address: { name: '...', street: '...', city: '...' },
  },
  recipient: {
    contact: { name: 'John Doe' },
    delivery: {
      method: 'HOME',  // or 'PICKUP_POINT'
      address: { name: '...', street: '...', city: '...' },  // for HOME only
    },
  },
  package: { weightGrams: 1000 },
  references: { customerReference: 'ORD-123' },
};
```

For APM/locker delivery:
```typescript
const parcel: Parcel = {
  // ... (same shipper, basic structure)
  recipient: {
    contact: { name: 'Jane' },
    delivery: {
      method: 'PICKUP_POINT',
      pickupPoint: {
        id: 'APM-FOX-12345',  // Foxpost locker code
        provider: 'foxpost',
        type: 'LOCKER',
      },
    },
  },
  package: { weightGrams: 300 },
};
```

### Contributors

- Project team (initial Phase 1 & 2 implementation)

---

## [1.0.0] - 2024-12-XX (Hypothetical Previous Release)

### Added

- Initial Shopickup core library
- Foxpost adapter with CREATE_PARCEL, CREATE_LABEL, TRACK capabilities
- ESM/NodeNext monorepo foundation
- Vitest testing framework with v8 coverage
- Example dev server with SQLite
