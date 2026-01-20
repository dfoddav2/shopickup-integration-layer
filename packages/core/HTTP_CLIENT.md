HttpClient: interface, adapters, and examples

This document describes the minimal `HttpClient` interface used across Shopickup core and shows example adapters (Axios + fetch). It also explains how to use the shipped Axios wrapper and how to swap in a custom client.

Interface

- Location: `packages/core/src/interfaces/http-client.ts`
- Shape (summary):
  - `get<T>(url, config?)`
  - `post<T>(url, data?, config?)`
  - `put<T>(url, data?, config?)`
  - `patch<T>(url, data?, config?)`
  - `delete<T>(url, config?)`
- `HttpClientConfig` supports:
  - `headers?: Record<string,string>`
  - `timeout?: number` (ms)
  - `params?: Record<string,unknown>`
  - additional passthrough fields allowed

Error contract

- On non-2xx responses or transport errors, the client SHOULD throw an Error object augmented with at least:
  - `status?: number` — HTTP status code when available
  - `response?: { status, statusText?, data?, headers? }` — parsed body in `data` when available
- This makes adapter error translation easier and consistent across implementations.

Provided implementations

1) Axios-backed client

- Factory: `createAxiosHttpClient(opts?: { axiosInstance?, defaultTimeoutMs?, debug?, debugFullBody?, logger? })`
  - `debug?: boolean` — enable request/response debug logs (redacts sensitive headers by default)
  - `debugFullBody?: boolean` — when true, includes a small `bodyPreview` (first 200 chars) in logs
  - `logger?: Logger` — optional structured logger implementing `debug/info/warn/error`
- Normalizes Axios errors to include `status` and `response.data`.

2) Fetch-backed client

- Factory: `createFetchHttpClient(opts?: { fetchFn?, defaultTimeoutMs?, debug?, debugFullBody?, logger? })`
  - `fetchFn` is required in environments where `fetch` is not global (Node < 18). Example: pass `fetchFn: (await import('node-fetch')).default` or `undici.fetch`.
  - Same debug and logger options as Axios client.
- Normalizes non-2xx responses into an Error with `status` and `response.data`.

Debug & Logging

- Debug options are per-client and default to checking env `HTTP_DEBUG=1` if `debug` is omitted.
- By default the clients redact sensitive headers (`authorization`, `api-key`, `x-api-key`, `password`, `token`) and do not print full request/response bodies. Use `debugFullBody: true` for a short preview.
- Provide your own logger to integrate with your system's structured logs.

Examples

- Axios client (dev server):

```ts
import { createAxiosHttpClient } from '@shopickup/core';
const http = createAxiosHttpClient({ debug: true, debugFullBody: false });
await http.post('https://carrier.example/parcels', { /* payload */ }, { headers: { 'Api-key': '...' } });
```

- Fetch client (Node <18):

```ts
import { createFetchHttpClient } from '@shopickup/core/http/fetch-client';
import fetch from 'node-fetch';
const http = createFetchHttpClient({ fetchFn: fetch, debug: true });
```

Testing & Mocking

- Unit tests in the repo assert behavior and error normalization. `nock` is used to simulate carrier HTTP responses for Axios tests.

Publishing notes

- The package exports `createAxiosHttpClient` and `createFetchHttpClient` from the root and also exposes subpath exports under `./http/*`.
- Build (`tsc`) must be run before publishing so `dist/http/*.js` exists and matches the `exports` field.

If you need a smaller browser-only client or additional wrappers (e.g., for `undici`), I can add them as lightweight adapters that implement the same interface.
