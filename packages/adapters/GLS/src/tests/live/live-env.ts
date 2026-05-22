import { GLSAdapter } from '../../index.js';
import { createFetchHttpClient } from '@shopickup/core';
import type { AdapterContext } from '@shopickup/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type GLSLiveConfig =
  | {
      enabled: true;
      adapter: GLSAdapter;
      context: AdapterContext;
      credentials: {
        username: string;
        password: string;
        clientNumberList: number[];
        webshopEngine?: string;
      };
      useTestApi: boolean;
      country: string;
      pickupPointId: string;
    }
  | {
      enabled: false;
      reason: string;
    };

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

export function getGLSLiveConfig(): GLSLiveConfig {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  loadEnvFile(path.join(packageRoot, '.env.live'));

  const username = process.env.GLS_LIVE_USERNAME;
  const password = process.env.GLS_LIVE_PASSWORD;
  const clientNumberListRaw = process.env.GLS_LIVE_CLIENT_NUMBER_LIST;
  const webshopEngine = process.env.GLS_LIVE_WEBSHOP_ENGINE;
  const useTestApi = process.env.GLS_LIVE_USE_TEST_API !== 'false';
  const country = process.env.GLS_LIVE_COUNTRY || 'HU';
  const pickupPointId = process.env.GLS_LIVE_PICKUP_POINT_ID || '379-PARCELSHOP';

  if (!username || !password) {
    return {
      enabled: false,
      reason: 'Set GLS_LIVE_USERNAME and GLS_LIVE_PASSWORD to run live GLS tests.',
    };
  }

  const clientNumberList = clientNumberListRaw
    ? clientNumberListRaw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    : [];

  const adapter = new GLSAdapter();
  const context: AdapterContext = {
    http: createFetchHttpClient(),
    logger: console,
  };

  return {
    enabled: true,
    adapter,
    context,
    credentials: {
      username,
      password,
      clientNumberList,
      webshopEngine: webshopEngine || undefined,
    },
    useTestApi,
    country,
    pickupPointId,
  };
}
