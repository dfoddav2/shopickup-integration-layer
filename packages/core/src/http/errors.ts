/**
 * HTTP Error Type
 * Typed error class for HTTP client implementations
 * Replaces the pattern of `(err as any).property = value`
 */
export class HttpError extends Error {
  isAxiosError?: boolean;
  status?: number;
  response?: {
    status: number;
    statusText: string;
    data: unknown;
    headers?: Record<string, string | string[]>;
  };

  constructor(message: string, properties?: Omit<HttpError, 'message' | 'name'>) {
    super(message);
    this.name = 'HttpError';
    
    if (properties?.isAxiosError) {
      this.isAxiosError = properties.isAxiosError;
    }
    if (properties?.status !== undefined) {
      this.status = properties.status;
    }
    if (properties?.response) {
      this.response = properties.response;
    }
  }
}
