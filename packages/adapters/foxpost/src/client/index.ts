/**
 * Foxpost HTTP Client Utilities
 * Thin utilities for building Foxpost API requests
 */

import type { FoxpostCredentials } from '../validation.js';

/**
 * Build standard Foxpost auth headers
 * Requires both Basic auth (username:password) and API key
 */
export function buildFoxpostHeaders(credentials: FoxpostCredentials): Record<string, string> {
  const { apiKey, basicUsername, basicPassword } = credentials;

  const basicAuth = Buffer.from(`${basicUsername}:${basicPassword}`).toString("base64");

  return {
    "Content-Type": "application/json",
    "Authorization": `Basic ${basicAuth}`,
    ...(apiKey && { "Api-key": apiKey }),
  };
}

/**
 * Build Foxpost headers for binary responses (e.g., PDF)
 */
export function buildFoxpostBinaryHeaders(credentials: FoxpostCredentials): Record<string, string> {
  const { apiKey, basicUsername, basicPassword } = credentials;

  const basicAuth = Buffer.from(`${basicUsername}:${basicPassword}`).toString("base64");

  return {
    "Authorization": `Basic ${basicAuth}`,
    ...(apiKey && { "Api-key": apiKey }),
  };
}
