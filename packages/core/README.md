# @shopickup/core

Core types, interfaces, flows, and HTTP helpers for Shopickup.

Open source on GitHub: <https://github.com/shopickup/shopickup-integration-layer>

## What this is

- Canonical shipping domain types
- Carrier adapter interfaces and capabilities
- Orchestration helpers for label flows
- Pluggable HTTP client wrappers
- Generic pickup-point requests where carrier auth is optional

## What this is not

- A carrier-specific SDK
- A persistence layer
- An API server

## Install

```bash
pnpm add @shopickup/core
```

## Use

```ts
import { createAxiosHttpClient, type CarrierAdapter } from '@shopickup/core';
```

```ts
import { createFetchHttpClient } from '@shopickup/core/http/fetch-client';
```

## HTTP clients

- `createAxiosHttpClient()` is included for Node-friendly integrations that want Axios.
- `createFetchHttpClient()` is included for environments that prefer `fetch`.
- Adapters do not own HTTP behavior; callers provide the client.

## Pickup points

`FetchPickupPointsRequest.credentials` is optional in core. Individual adapters decide whether pickup-point lookup is public or authenticated.

## Opening hours

`PickupPoint.openingHours` uses a recommended canonical shape shared across adapters:

```ts
{
  Monday:   "08:00 - 18:00",
  Friday:   "09:00 - 12:00, 13:00 - 17:00", // split shift / lunch break
  // closed days omitted
}
```

- Keys: full English weekday names (`Monday`..`Sunday`).
- Values: 24-hour `"HH:MM - HH:MM"` intervals; multiple intervals joined with `", "`.
- Closed days are omitted; `openingHours` is `undefined` when nothing is open.
- The raw carrier shape is preserved on the point (`metadata` / `raw`).

Helpers are exported from the package root:

```ts
import {
  buildOpeningHours,
  normalizeTimeRange,
  normalizeHungarianDayName,
  formatOpenInterval,
  WEEKDAY_NAMES,
} from '@shopickup/core';
```

## Status

This package is early and published as `0.0.8`.

## Releases

The package follows `0.x.x` versioning while the API is still evolving.
