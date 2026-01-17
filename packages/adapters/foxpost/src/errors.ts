import axios from "axios";
import { CarrierError } from "@shopickup/core";

/**
 * Foxpost-specific error code translations
 */
const FoxpostErrorCodes: Record<string, { category: string; message: string }> =
  {
    WRONG_USERNAME_OR_PASSWORD: {
      category: "Auth",
      message: "Invalid Foxpost credentials",
    },
    INVALID_APM_ID: {
      category: "Validation",
      message: "Invalid APM (locker) ID",
    },
    INVALID_RECIPIENT: {
      category: "Validation",
      message: "Invalid recipient information",
    },
    INVALID_ADDRESS: {
      category: "Validation",
      message: "Invalid address provided",
    },
  };

/**
 * Translate Foxpost errors to structured CarrierError
 */
export function translateFoxpostError(error: unknown): CarrierError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as Record<string, unknown>;

    // Map to Foxpost error code if available
    const errorCode = (data?.error as string) || `HTTP_${status}`;
    const errorMapping = FoxpostErrorCodes[errorCode];

    if (status === 400) {
      return new CarrierError(
        `Validation error: ${errorMapping?.message || data?.error || "Bad request"}`,
        "Validation",
        {
          carrierCode: errorCode,
          raw: data,
        }
      );
    } else if (status === 401 || status === 403) {
      return new CarrierError("Foxpost credentials invalid", "Auth", {
        carrierCode: errorCode,
        raw: data,
      });
    } else if (status === 429) {
      return new CarrierError("Foxpost rate limit exceeded", "RateLimit", {
        retryAfterMs: 60000,
        carrierCode: errorCode,
        raw: data,
      });
    } else if (status && status >= 500) {
      return new CarrierError("Foxpost server error", "Transient", {
        carrierCode: errorCode,
        raw: data,
      });
    }
  }

  // Network error, timeout, etc.
  if (error instanceof Error) {
    return new CarrierError(
      `Foxpost connection error: ${error.message}`,
      "Transient",
      { raw: error }
    );
  }

  return new CarrierError("Unknown Foxpost error", "Permanent", { raw: error });
}
