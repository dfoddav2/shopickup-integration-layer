import { MPLAdapter } from '../../index.js';
import { createFetchHttpClient } from '@shopickup/core';
import type { AdapterContext } from '@shopickup/core';
import { exchangeAuthToken } from '../../capabilities/auth.js';
import { createResolveOAuthUrl } from '../../utils/resolveBaseUrl.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type MPLLiveConfig =
  | {
      enabled: true;
      adapter: MPLAdapter;
      context: AdapterContext;
      credentials: {
        apiKey: string;
        apiSecret: string;
        accountingCode: string;
        agreementCode: string;
        bankAccountNumber: string;
      };
      baseUrl: string;
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

export async function getMPLLiveConfig(): Promise<MPLLiveConfig> {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  loadEnvFile(path.join(packageRoot, '.env.live'));

  const apiKey = process.env.MPL_LIVE_API_KEY;
  const apiSecret = process.env.MPL_LIVE_API_SECRET;
  const accountingCode = process.env.MPL_LIVE_ACCOUNTING_CODE;
  const agreementCode = process.env.MPL_LIVE_AGREEMENT_CODE;
  const bankAccountNumber = process.env.MPL_LIVE_BANK_ACCOUNT_NUMBER;
  const baseUrl = process.env.MPL_LIVE_BASE_URL || 'https://sandbox.api.posta.hu/v2/mplapi';

  if (!apiKey || !apiSecret) {
    return {
      enabled: false,
      reason: 'Set MPL_LIVE_API_KEY and MPL_LIVE_API_SECRET to run live MPL tests.',
    };
  }

  const adapter = new MPLAdapter();
  const context: AdapterContext = {
    http: createFetchHttpClient(),
    logger: console,
  };

  return {
    enabled: true,
    adapter,
    context,
    credentials: {
      apiKey,
      apiSecret,
      accountingCode: accountingCode || 'ACC-001',
      agreementCode: agreementCode || 'AGR-001',
      bankAccountNumber: bankAccountNumber || '12345678-12345678',
    },
    baseUrl,
  };
}

/**
 * Exchanges API key credentials for an OAuth2 Bearer token.
 * Call this before any MPL API operation that requires OAuth2 auth.
 */
export async function exchangeMPLToken(
  config: Extract<MPLLiveConfig, { enabled: true }>,
): Promise<string> {
  const { credentials, baseUrl, context } = config;
  const resolveOAuthUrl = createResolveOAuthUrl(
    'https://core.api.posta.hu/oauth2/token',
    'https://sandbox.api.posta.hu/oauth2/token',
  );

  const result = await exchangeAuthToken(
    {
      credentials: {
        authType: 'apiKey',
        apiKey: credentials.apiKey,
        apiSecret: credentials.apiSecret,
      },
      options: {
        useTestApi: baseUrl.includes('sandbox'),
      },
    },
    context,
    resolveOAuthUrl,
    credentials.accountingCode,
  );

  return result.access_token;
}
