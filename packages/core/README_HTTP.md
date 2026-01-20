Using the HTTP clients in @shopickup/core

Quick start

1. Import from package root:

```ts
import { createAxiosHttpClient } from '@shopickup/core';

const http = createAxiosHttpClient({ debug: true, debugFullBody: false });
```

2. Or import explicit subpath:

```ts
import { createFetchHttpClient } from '@shopickup/core/http/fetch-client';

const http = createFetchHttpClient({ fetchFn: globalThis.fetch, debug: false });
```

Notes

- In Node <18 provide `fetchFn`.
- `debug` controls whether logs are emitted; `debugFullBody` allows a short preview of bodies to aid debugging.
- The clients adhere to the `HttpClient` interface defined in `packages/core/src/interfaces/http-client.ts`.

If you want, I can add a usage snippet for integrating with Express/Fastify or for supplying a custom logger (e.g., pino).
