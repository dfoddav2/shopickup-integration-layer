# @shopickup/core

Core types, interfaces, flows, and HTTP helpers for Shopickup.

Open source on GitHub: <https://github.com/shopickup/shopickup-integration-layer>

## What this is

- Canonical shipping domain types
- Carrier adapter interfaces and capabilities
- Orchestration helpers for label flows
- Pluggable HTTP client wrappers

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

## Status

This package is early and published as `0.0.1`.

## Releases

The package follows `0.x.x` versioning while the API is still evolving.
