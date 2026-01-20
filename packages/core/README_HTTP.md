# Using the HTTP clients in @shopickup/core

There are two provided HTTP client implementations in `@shopickup/core`: one based on Axios and one based on the Fetch API. Both adhere to the same `HttpClient` interface, making it easy to swap between them or implement your own.

## Import from package root

```ts
import { createAxiosHttpClient } from '@shopickup/core';

const http = createAxiosHttpClient({ debug: true, debugFullBody: false });
```

## Or import explicit subpath

```ts
import { createFetchHttpClient } from '@shopickup/core/http/fetch-client';

const http = createFetchHttpClient({ fetchFn: globalThis.fetch, debug: false });
```

## Nodes

- In Node <18 provide `fetchFn`.
- `debug` controls whether logs are emitted; `debugFullBody` allows a short preview of bodies to aid debugging.
- The clients adhere to the `HttpClient` interface defined in `packages/core/src/interfaces/http-client.ts`.

If you want, I can add a usage snippet for integrating with Express/Fastify or for supplying a custom logger (e.g., pino).
