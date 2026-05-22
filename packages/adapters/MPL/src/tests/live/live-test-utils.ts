/**
 * Live test polling utilities
 *
 * Reusable helpers for adapter live tests that need to wait for carrier-side
 * eventual consistency (e.g. parcel registration in tracking systems).
 */

export interface PollWithRetriesOptions {
  /** Maximum number of attempts (includes the first call) */
  maxRetries: number;
  /** Delay in ms between retries */
  retryDelayMs: number;
  /**
   * Predicate that decides whether an error is retryable.
   * Defaults to checking err.category === 'NotFound'.
   */
  isRetryable?: (err: any) => boolean;
}

export interface PollWithRetriesResult<T> {
  result: T;
  attempts: number;
}

/**
 * Poll an async operation with a fixed delay between retries.
 *
 * Use this in live tests when a carrier needs time to register a parcel
 * in its tracking system before it can be queried.
 *
 * @param operation The async operation to poll
 * @param options Polling configuration
 * @returns The first successful result plus the number of attempts taken
 * @throws The last error if all retries are exhausted, or immediately on non-retryable errors
 */
export async function pollWithRetries<T>(
  operation: () => Promise<T>,
  options: PollWithRetriesOptions,
): Promise<PollWithRetriesResult<T>> {
  const { maxRetries, retryDelayMs, isRetryable = defaultIsRetryable } = options;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      return { result, attempts: attempt };
    } catch (err: any) {
      lastError = err;
      if (!isRetryable(err) || attempt === maxRetries) {
        throw err;
      }
      await sleep(retryDelayMs);
    }
  }

  // Should never reach here because the loop either returns or throws
  throw lastError;
}

function defaultIsRetryable(err: any): boolean {
  return err?.category === 'NotFound' || err?.message?.includes('NotFound');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
