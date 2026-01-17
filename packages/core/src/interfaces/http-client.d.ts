/**
 * HttpClient interface
 * Pluggable HTTP client that adapters use to make requests
 * Allows integrators to inject their own HTTP layer with custom middleware
 */
export interface HttpClient {
    /**
     * GET request
     */
    get<T = unknown>(url: string, config?: HttpClientConfig): Promise<T>;
    /**
     * POST request
     */
    post<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<T>;
    /**
     * PUT request
     */
    put<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<T>;
    /**
     * PATCH request
     */
    patch<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<T>;
    /**
     * DELETE request
     */
    delete<T = unknown>(url: string, config?: HttpClientConfig): Promise<T>;
}
export interface HttpClientConfig {
    headers?: Record<string, string>;
    timeout?: number;
    params?: Record<string, unknown>;
    [key: string]: unknown;
}
//# sourceMappingURL=http-client.d.ts.map