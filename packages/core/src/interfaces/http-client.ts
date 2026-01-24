/**
 * Standardized HTTP response
 * 
 * All HttpClient implementations (axios, fetch, undici, custom) normalize to this shape.
 * This provides a single source of truth for adapters and eliminates defensive normalization logic.
 */
export interface HttpResponse<T = unknown> {
  /**
   * HTTP status code (e.g., 200, 404, 500)
   */
  status: number;

  /**
   * Response headers (case-insensitive keys, values are strings or string arrays)
   */
  headers: Record<string, string | string[]>;

  /**
   * Response body
   * - For JSON: parsed object (T)
   * - For binary: Buffer or Uint8Array
   * - For text: string
   * - For empty: undefined or null
   */
  body: T;

  /**
   * Optional: request that was sent (for debugging, may be sanitized in logs)
   * Typically included only if config.captureRequest was true
   */
  request?: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
}

/**
 * HttpClient interface
 * Pluggable HTTP client that adapters use to make requests
 * Allows integrators to inject their own HTTP layer with custom middleware
 * 
 * All implementations must return normalized HttpResponse<T> for consistency.
 * This eliminates the need for adapters to defensively normalize response shapes
 * from different HTTP client libraries (axios vs fetch, etc.).
 */
export interface HttpClient {
  /**
   * GET request
   * @returns HttpResponse with parsed body in response.body
   */
  get<T = unknown>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>>;

  /**
   * POST request
   * @returns HttpResponse with parsed body in response.body
   */
  post<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>>;

  /**
   * PUT request
   * @returns HttpResponse with parsed body in response.body
   */
  put<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>>;

  /**
   * PATCH request
   * @returns HttpResponse with parsed body in response.body
   */
  patch<T = unknown>(url: string, data?: unknown, config?: HttpClientConfig): Promise<HttpResponse<T>>;

  /**
   * DELETE request
   * @returns HttpResponse with parsed body in response.body
   */
  delete<T = unknown>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>>;
}

export interface HttpClientConfig {
  /**
   * Request headers to send
   */
  headers?: Record<string, string>;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Query parameters (appended to URL)
   */
  params?: Record<string, unknown>;

  /**
   * Expected response type hint (helps client decode response correctly)
   * - "json": parse response as JSON (default)
   * - "arraybuffer" or "binary": return raw bytes (Buffer or Uint8Array)
   * - "stream": return readable stream
   * - "text": parse as text string
   */
  responseType?: 'json' | 'arraybuffer' | 'binary' | 'stream' | 'text';

  /**
   * Whether to capture request details in response (for debugging)
   * If true, HttpResponse.request will be populated
   * Default: false (for security/performance)
   */
  captureRequest?: boolean;

  /**
   * Custom options for specific HTTP client implementations
   * Allows pass-through of client-specific config
   */
  [key: string]: unknown;
}
