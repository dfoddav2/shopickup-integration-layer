import { createAxiosHttpClient } from '@shopickup/core';

// Export a ready-to-use HttpClient backed by Axios for the dev server.
// Integrators can replace this with their own client by providing a different implementation
// that matches the `HttpClient` interface.
export const httpClient = createAxiosHttpClient({ defaultTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS) || 15000 });
