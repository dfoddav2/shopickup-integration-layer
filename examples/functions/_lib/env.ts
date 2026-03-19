import dotenv from 'dotenv';
import path from 'path';

export function loadEnv(envFile?: string) {
  if (envFile) {
    dotenv.config({ path: path.resolve(envFile) });
  } else {
    dotenv.config();
  }

  // Minimal: return process.env for consumers
  return process.env as Record<string, string | undefined>;
}

export function requireEnv(key: string) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}
