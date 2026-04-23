#!/usr/bin/env ts-node
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';
import { inspect } from 'util';

import { loadEnv } from './_lib/env.ts';
import { createHttpClient, buildAdapterContext } from './_lib/context.ts';
import { wrapPinoLogger } from './_lib/logger.ts';
import { serializeForLog } from './_lib/serialize.ts';

const __filename = fileURLToPath(import.meta.url);
const FUNCTIONS_DIR = path.join(path.dirname(__filename));
const THIS_DIR = path.dirname(__filename);

type CliOutput = ReturnType<typeof createCliOutput>;

function getFlagValue(argv: string[], flagNames: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    for (const flag of flagNames) {
      if (current === flag) {
        return argv[i + 1];
      }
      if (current.startsWith(`${flag}=`)) {
        return current.slice(flag.length + 1);
      }
    }
  }
  return undefined;
}

function isLabelExampleFunction(functionId: string): boolean {
  const operation = functionId.split('.')[1] || '';
  return ['create-label', 'create-labels', 'print-label', 'print-labels'].includes(operation);
}

function resolveLabelOutputExtension(result: unknown): string {
  const record = result as Record<string, unknown> | undefined;
  const fileCandidate = record?.file as Record<string, unknown> | undefined;
  const filesCandidate = Array.isArray(record?.files) ? (record?.files as Array<Record<string, unknown>>) : [];
  const resultLabelFormat = typeof record?.labelFormat === 'string' ? record.labelFormat : undefined;
  const resultContentType = typeof record?.contentType === 'string' ? record.contentType : undefined;
  const metadataContentType = typeof record?.metadata === 'object' && record?.metadata
    ? (record.metadata as Record<string, unknown>).contentType
    : undefined;
  const fileLabelFormat = typeof fileCandidate?.labelFormat === 'string' ? fileCandidate.labelFormat : undefined;
  const fileMetadataLabelFormat = typeof fileCandidate?.metadata === 'object' && fileCandidate?.metadata
    ? (fileCandidate.metadata as Record<string, unknown>).labelFormat
    : undefined;
  const resultMetadataLabelFormat = typeof record?.metadata === 'object' && record?.metadata
    ? (record.metadata as Record<string, unknown>).labelFormat
    : undefined;
  const filesLabelFormat = filesCandidate.find((file) => typeof file?.labelFormat === 'string')?.labelFormat;
  const contentType =
    (typeof fileLabelFormat === 'string' && fileLabelFormat) ||
    (typeof fileMetadataLabelFormat === 'string' && fileMetadataLabelFormat) ||
    (typeof filesLabelFormat === 'string' && filesLabelFormat) ||
    (typeof resultLabelFormat === 'string' && resultLabelFormat) ||
    (typeof resultMetadataLabelFormat === 'string' && resultMetadataLabelFormat) ||
    (typeof fileCandidate?.contentType === 'string' && fileCandidate.contentType) ||
    filesCandidate.find((file) => typeof file?.contentType === 'string')?.contentType ||
    resultContentType ||
    (typeof metadataContentType === 'string' ? metadataContentType : undefined);

  if (typeof contentType === 'string' && contentType.toUpperCase().includes('ZPL')) {
    return 'zpl';
  }

  return 'pdf';
}

function deriveLabelOutputPath(functionFile: string, result: unknown): string {
  const directory = path.dirname(functionFile);
  const baseName = path.basename(functionFile, path.extname(functionFile));
  return path.join(directory, `${baseName}.${resolveLabelOutputExtension(result)}`);
}

function decodePotentialBase64(input: string): Buffer | undefined {
  const compact = input.trim().replace(/\s+/g, '');
  if (!compact || compact.length < 64 || compact.length % 4 !== 0) return undefined;
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return undefined;

  try {
    const decoded = Buffer.from(compact, 'base64');
    if (decoded.length === 0) return undefined;
    return decoded;
  } catch (_) {
    return undefined;
  }
}

function extractLabelBytes(value: unknown, seen = new WeakSet<object>()): Buffer | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value as any)) {
    return value as Buffer;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 255)) {
      return Buffer.from(value as number[]);
    }
    for (const item of value) {
      const extracted = extractLabelBytes(item, seen);
      if (extracted) return extracted;
    }
    return undefined;
  }

  if (typeof value === 'string') {
    return decodePotentialBase64(value);
  }

  if (typeof value !== 'object') return undefined;
  if (seen.has(value as object)) return undefined;
  seen.add(value as object);

  const record = value as Record<string, unknown>;
  const preferredKeys = ['pdfBuffer', 'rawBytes', 'labels', 'label', 'base64', 'data', 'body'];

  for (const key of preferredKeys) {
    if (key in record) {
      const extracted = extractLabelBytes(record[key], seen);
      if (extracted) return extracted;
    }
  }

  if (Array.isArray(record.files)) {
    for (const file of record.files) {
      const extracted = extractLabelBytes(file, seen);
      if (extracted) return extracted;
    }
  }

  for (const [, nested] of Object.entries(record)) {
    const extracted = extractLabelBytes(nested, seen);
    if (extracted) return extracted;
  }

  return undefined;
}

function saveLabelOutput(result: unknown, outputPath: string): { saved: boolean; byteLength?: number } {
  const bytes = extractLabelBytes(result);
  if (!bytes) return { saved: false };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes);
  return { saved: true, byteLength: bytes.length };
}

function createCliOutput(logFilePath?: string) {
  const resolvedLogFilePath = logFilePath ? path.resolve(logFilePath) : undefined;

  function appendToFile(entry: string) {
    if (!resolvedLogFilePath) return;
    fs.mkdirSync(path.dirname(resolvedLogFilePath), { recursive: true });
    fs.appendFileSync(resolvedLogFilePath, entry.endsWith('\n') ? entry : `${entry}\n`);
  }

  function renderMeta(meta: unknown) {
    if (meta === undefined || meta === null || meta === '') return '';
    if (typeof meta === 'string') return meta;
    try {
      return inspect(meta, { depth: null, colors: false, compact: false, sorted: true });
    } catch (_) {
      return String(meta);
    }
  }

  function emit(level: 'debug' | 'info' | 'warn' | 'error' | 'log', message: string, meta?: unknown) {
    const renderedMeta = renderMeta(meta);
    const line = renderedMeta ? `${message} ${renderedMeta}` : message;

    if (resolvedLogFilePath) {
      appendToFile(`[${new Date().toISOString()}] [${level}] ${line}`);
    }

    const shouldPrintToConsole = !resolvedLogFilePath || level === 'warn' || level === 'error' || level === 'log';
    if (!shouldPrintToConsole) return;

    if (level === 'warn') {
      if (meta === undefined) console.warn(message);
      else console.warn(message, meta);
      return;
    }

    if (level === 'error') {
      if (meta === undefined) console.error(message);
      else console.error(message, meta);
      return;
    }

    if (meta === undefined) console.log(message);
    else console.log(message, meta);
  }

  function formatForFile(value: unknown) {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      try {
        return JSON.stringify(serializeForLog(value), null, 2);
      } catch (err) {
        return String(err instanceof Error ? err.message : value);
      }
    }
  }

  return {
    logFilePath: resolvedLogFilePath,
    log(message: string, meta?: unknown) {
      emit('log', message, meta);
    },
    info(message: string, meta?: unknown) {
      emit('info', message, meta);
    },
    debug(message: string, meta?: unknown) {
      emit('debug', message, meta);
    },
    warn(message: string, meta?: unknown) {
      emit('warn', message, meta);
    },
    error(message: string, meta?: unknown) {
      emit('error', message, meta);
    },
    writeSection(title: string, value: unknown) {
      if (!resolvedLogFilePath) return;
      const body = formatForFile(value);
      appendToFile(`\n=== ${title} ===\n${body}`);
    },
  };
}

function findArgsFile(pathStr: string): string | undefined {
  const candidates = [
    pathStr,
    path.resolve(pathStr),
    path.resolve(process.cwd(), pathStr),
    path.resolve(FUNCTIONS_DIR, pathStr),
    path.resolve(THIS_DIR, pathStr),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (e) {
      // ignore
    }
  }
  // Try resolving relative to repo root (walk up to find package.json)
  try {
    let curr = process.cwd();
    for (let i = 0; i < 6; i++) {
      const candidatePkg = path.join(curr, 'package.json');
      if (fs.existsSync(candidatePkg)) {
        const repoCandidate = path.resolve(curr, pathStr);
        if (fs.existsSync(repoCandidate)) return repoCandidate;
      }
      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
  } catch (e) {
    // ignore
  }
  return undefined;
}

function normalizeArgPath(p: string) {
  if (!p) return p;
  // If caller passed a repo-root-relative path like 'examples/functions/...'
  // but the process CWD is already the package dir, strip the leading segment.
  const prefix = path.join('examples', 'functions') + path.sep;
  if (p.startsWith(prefix) && process.cwd().endsWith(path.join('examples', 'functions'))) {
    return p.replace(new RegExp('^' + prefix.replace(/\\/g, '\\' + path.sep)), '');
  }
  return p;
}

function discoverFunctions() {
  const carriers = fs.readdirSync(FUNCTIONS_DIR)
    .filter((f) => fs.statSync(path.join(FUNCTIONS_DIR, f)).isDirectory())
    .filter((d) => !d.startsWith('_')); // skip helper dirs
  const modules: Array<{ id: string; file: string }> = [];
  for (const c of carriers) {
    const files = fs.readdirSync(path.join(FUNCTIONS_DIR, c)).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    for (const f of files) {
      const modPath = `./${c}/${f}`;
      const id = `${c}.${path.basename(f, '.ts')}`;
      modules.push({ id, file: modPath });
    }
  }
  return modules;
}

async function runModuleById(modules: Array<{ id: string; file: string }>, id: string, argsInput?: string, useMockHttp = false, fullLogs = false, exchangeFirst = false, saveLabelOutputFlag = false, output?: CliOutput) {
  const found = modules.find((m) => m.id === id);
  if (!found) throw new Error(`Function not found: ${id}`);
  const carrier = id.split('.')[0];

  const mod = await import(found.file);
  const meta = mod.meta || {};
  output?.log(`Running: ${meta.id || found.file} - ${meta.description || ''}`);

  let args: any = {};
  if (argsInput) {
    // If argsInput is a path to a file, load it; otherwise try to parse as JSON
    try {
      const possiblePath = argsInput;
      // Normalize when callers pass a repository-root-relative path while the
      // script runs with CWD at the package directory, which can create
      // duplicated path fragments like "examples/functions/examples/functions/...".
      let normalized = possiblePath;
      if (
        typeof possiblePath === 'string' &&
        possiblePath.startsWith('examples' + path.sep + 'functions' + path.sep) &&
        process.cwd().endsWith(path.sep + 'examples' + path.sep + 'functions')
      ) {
        normalized = possiblePath.replace(/^examples[\\/]+functions[\\/]+/, '');
      }

      // If the input is already a JSON string, prefer parsing it first
      try {
        args = JSON.parse(possiblePath);
        // If parsing succeeded, we are done
        // eslint-disable-next-line no-empty
      } catch (_) {
        // Not raw JSON; treat as path candidates
        const candidates = [] as string[];

        if (path.isAbsolute(normalized)) candidates.push(normalized);
        candidates.push(path.resolve(normalized));
        candidates.push(path.resolve(process.cwd(), normalized));
        candidates.push(path.resolve(FUNCTIONS_DIR, normalized));
        candidates.push(path.resolve(THIS_DIR, normalized));

        let foundPath: string | undefined;
        for (const p of candidates) {
          try {
            if (p && fs.existsSync(p)) {
              foundPath = p;
              break;
            }
          } catch (e) {
            // ignore
          }
        }

        if (!foundPath) {
          output?.error('Args parsing: candidates checked', candidates);
          throw new Error(`Args file not found: ${possiblePath}`);
        }

        const content = fs.readFileSync(foundPath, 'utf8');
        args = JSON.parse(content);
      }
    } catch (err) {
      throw new Error(`Failed to parse args: ${(err as Error).message}`);
    }
  }

  // Apply environment overrides (e.g. MPL_API_KEY / MPL_OAUTH_TOKEN)
  args = applyEnvOverridesToArgs(args, carrier, output);

  // If fullLogs requested, print the effective args (with sensitive fields redacted)
  if (fullLogs) {
    const redacted = redactArgsForLog(args);
    try {
      output?.info('Effective args', JSON.stringify(redacted, null, 2));
    } catch (e) {
      output?.info('Effective args', redactArgsForLog(args));
    }
  }

  // When fullLogs is requested, enable the HTTP client's full-debug env flags so
  // carriers' HTTP debug output includes request/response bodies where available.
  if (fullLogs) {
    try {
      process.env.HTTP_DEBUG = '1';
      process.env.HTTP_DEBUG_FULL = '1';
    } catch (_) {
      // ignore
    }
  }

  const httpClient = createHttpClient({ useMock: useMockHttp, debug: fullLogs || !!output?.logFilePath, logger: output ? wrapPinoLogger(output) : wrapPinoLogger(console as any) });
  // If requested, perform an auth token exchange first (useful when ENV contains stale oauth token)
  try {
    if (exchangeFirst && carrier === 'mpl') {
      // Build a minimal context for the exchange
      const exchHttp = createHttpClient({ useMock: useMockHttp, debug: fullLogs || !!output?.logFilePath, logger: output ? wrapPinoLogger(output) : wrapPinoLogger(console as any) });
      const exchCtx = { adapterContext: buildAdapterContext(exchHttp, output || wrapPinoLogger(console as any), 'exchangeAuthToken') } as any;

      // Prepare exchange request credentials: prefer explicit API key/secret from env or args
      const exchangeReq: any = { credentials: {}, options: { useTestApi: args?.options?.useTestApi } };
      // Prefer env API key/secret
      if (process.env.MPL_API_KEY) exchangeReq.credentials.apiKey = process.env.MPL_API_KEY;
      if (process.env.MPL_API_SECRET) exchangeReq.credentials.apiSecret = process.env.MPL_API_SECRET;
      // Fallback to args.credentials if env not provided
      if (!exchangeReq.credentials.apiKey && args.credentials?.apiKey) exchangeReq.credentials.apiKey = args.credentials.apiKey;
      if (!exchangeReq.credentials.apiSecret && args.credentials?.apiSecret) exchangeReq.credentials.apiSecret = args.credentials.apiSecret;

      if (exchangeReq.credentials.apiKey && exchangeReq.credentials.apiSecret) {
        output?.log('Performing token exchange before call (exchangeFirst enabled)');
        const { MPLAdapter } = await import('@shopickup/adapters-mpl');
        const adapter = new MPLAdapter();
        try {
          // Use debug mode for the exchange HTTP client when detailed logging is requested
          exchCtx.adapterContext.http = createHttpClient({ useMock: useMockHttp, debug: fullLogs || !!output?.logFilePath, logger: output ? wrapPinoLogger(output) : wrapPinoLogger(console as any) });
          const exchanged = await (adapter as any).exchangeAuthToken(exchangeReq, exchCtx.adapterContext);
          // Inject the newly acquired token into args for the forthcoming call
          args.credentials = args.credentials || {};
          args.credentials.authType = 'oauth2';
          args.credentials.access_token = exchanged.access_token;
          args.credentials.oAuth2Token = exchanged.access_token;
          if (fullLogs || output?.logFilePath) output?.info('Exchanged token (masked)', mask(exchanged.access_token));
        } catch (e) {
          output?.error('Token exchange failed', (e as any)?.message || e);
          throw e;
        }
      } else {
        output?.warn('exchangeFirst requested but no API key/secret available to perform token exchange');
      }
    }
  } catch (e) {
    // bubble up exchange errors
    throw e;
  }
  // If fullLogs is requested, set loggingOptions to show full responses
  const loggingOptions = (fullLogs || !!output?.logFilePath)
    ? { logRawResponse: true, maxArrayItems: 1000, maxDepth: 20 }
    : { logRawResponse: 'summary', maxArrayItems: 5, maxDepth: 2 };

  const ctx = { adapterContext: buildAdapterContext(httpClient, output || wrapPinoLogger(console as any), 'examples-cli') };
  // patch in loggingOptions if needed
  ctx.adapterContext.loggingOptions = loggingOptions as any;

  const result = await mod.run(args, ctx);

  if (saveLabelOutputFlag && isLabelExampleFunction(id)) {
    const outputPath = deriveLabelOutputPath(path.resolve(FUNCTIONS_DIR, found.file), result);
    const saved = saveLabelOutput(result, outputPath);
    if (saved.saved) {
      output?.log(`Saved label to ${outputPath}${saved.byteLength ? ` (${saved.byteLength} bytes)` : ''}`);
    } else {
      output?.warn('Label save requested but no binary PDF payload was found in the result');
    }
  }

  return result;
}

function redactArgsForLog(args: any) {
  if (!args) return args;
  const out: any = { ...args };
  try {
    if (out.credentials) {
      const c = { ...out.credentials };
      if (c.apiSecret) c.apiSecret = mask(c.apiSecret);
      if (c.apiKey) c.apiKey = mask(c.apiKey);
      if (c.access_token) c.access_token = mask(c.access_token);
      if (c.username) c.username = mask(c.username);
      if (c.password) c.password = mask(c.password);
      if (c.basicUsername) c.basicUsername = mask(c.basicUsername);
      if (c.basicPassword) c.basicPassword = mask(c.basicPassword);
      out.credentials = c;
    }
    if (out.options && out.options.mpl) {
      const m = { ...out.options.mpl };
      if (m.bankAccountNumber) m.bankAccountNumber = mask(m.bankAccountNumber);
      out.options = { ...out.options, mpl: m };
    }
    if (out.options && out.options.gls) {
      const g = { ...out.options.gls };
      out.options = { ...out.options, gls: g };
    }
  } catch (_) {
    // ignore
  }
  return out;
}

function mask(s: any) {
  try {
    const str = String(s);
    if (str.length <= 8) return 'REDACTED';
    return '****' + str.slice(-4);
  } catch (_) {
    return 'REDACTED';
  }
}

// Redact or truncate large label fields nested under common response shapes
function redactLargeLabels(obj: any) {
  if (!obj) return obj;
  try {
    const copy = JSON.parse(JSON.stringify(obj));

    function walk(node: any) {
      if (!node || typeof node !== 'object') return;
      for (const k of Object.keys(node)) {
        try {
          const v = node[k];
          if (typeof v === 'string') {
            const lk = k.toLowerCase();
            if (lk.includes('label') || lk.includes('pdf') || lk.includes('zpl') || lk.includes('base64')) {
              if (v.length > 512) node[k] = v.slice(0, 200) + `... [truncated ${v.length} chars]`;
            }
          } else if (Array.isArray(v)) {
            for (const item of v) walk(item);
          } else if (typeof v === 'object') {
            walk(v);
          }
        } catch (_) {
          // ignore
        }
      }
    }

    walk(copy);
    return copy;
  } catch (_) {
    return obj;
  }
}

function applyEnvOverridesToArgs(args: any, carrier?: string, output?: CliOutput) {
  const env = process.env;
  if (!env) return args;

  args = args || {};

  // Ensure credentials object
  args.credentials = args.credentials || {};

  if (carrier === 'mpl') {
    // Prefer explicit API key/secret when available (needed by exchangeAuthToken)
    if (env.MPL_API_KEY || env.MPL_API_SECRET) {
      args.credentials.authType = 'apiKey';
      if (env.MPL_API_KEY) args.credentials.apiKey = env.MPL_API_KEY;
      if (env.MPL_API_SECRET) args.credentials.apiSecret = env.MPL_API_SECRET;
    } else if (env.MPL_OAUTH_TOKEN) {
      // Fallback to OAuth token if no API key/secret provided
      args.credentials.authType = 'oauth2';
      args.credentials.access_token = env.MPL_OAUTH_TOKEN;
      args.credentials.oAuth2Token = env.MPL_OAUTH_TOKEN;
    }
  } else if (carrier === 'foxpost') {
    if (env.FOXPOST_API_KEY) args.credentials.apiKey = env.FOXPOST_API_KEY;
    if (env.FOXPOST_BASIC_USERNAME) args.credentials.basicUsername = env.FOXPOST_BASIC_USERNAME;
    if (env.FOXPOST_BASIC_PASSWORD) args.credentials.basicPassword = env.FOXPOST_BASIC_PASSWORD;
  } else if (carrier === 'gls') {
    if (env.GLS_USERNAME) args.credentials.username = env.GLS_USERNAME;
    if (env.GLS_PASSWORD) args.credentials.password = env.GLS_PASSWORD;
    if (env.GLS_CLIENT_ID) {
      const clientId = Number(env.GLS_CLIENT_ID);
      if (Number.isFinite(clientId) && clientId > 0) {
        args.credentials.clientNumberList = [clientId];
      }
    }
  }

  // Options
  args.options = args.options || {};
  // useTestApi override (env USE_TEST_API or MPL_USE_TEST_API)
  const useTestEnv = env.USE_TEST_API ?? env.MPL_USE_TEST_API;
  if (typeof useTestEnv === 'string') {
    const val = useTestEnv.toLowerCase();
    args.options.useTestApi = val === '1' || val === 'true';
  }

  if (carrier === 'mpl') {
    args.options.mpl = args.options.mpl || {};
    if (env.MPL_ACCOUNTING_CODE) args.options.mpl.accountingCode = env.MPL_ACCOUNTING_CODE;
    // Support both English and Hungarian env var names for the agreement code
    if (env.MPL_AGREEMENT_CODE) args.options.mpl.agreementCode = env.MPL_AGREEMENT_CODE;
    if (env.MPL_MEGALLAPODASKOD) args.options.mpl.agreementCode = env.MPL_MEGALLAPODASKOD;
    if (env.MPL_BANK_ACCOUNT_NUMBER) args.options.mpl.bankAccountNumber = env.MPL_BANK_ACCOUNT_NUMBER;
  } else if (carrier === 'gls') {
    args.options.gls = args.options.gls || {};
  }

  // HTTP base URL override (optional)
  if (env.HTTP_BASE_URL) {
    args.options.httpBaseUrl = env.HTTP_BASE_URL;
  }

  // Informative log (non-sensitive): which overrides applied + masked env values
  const applied: string[] = [];
  const masked: string[] = [];
  // Which credentials were actually applied to args
  if (carrier === 'mpl' && args.credentials?.authType === 'oauth2' && args.credentials?.access_token) {
    applied.push('MPL_OAUTH_TOKEN');
    masked.push(`MPL_OAUTH_TOKEN=${mask(env.MPL_OAUTH_TOKEN)}`);
  }
  if (carrier === 'mpl' && args.credentials?.authType === 'apiKey' && (args.credentials?.apiKey || args.credentials?.apiSecret)) {
    if (env.MPL_API_KEY) { applied.push('MPL_API_KEY'); masked.push(`MPL_API_KEY=${mask(env.MPL_API_KEY)}`); }
    if (env.MPL_API_SECRET) { applied.push('MPL_API_SECRET'); masked.push(`MPL_API_SECRET=${mask(env.MPL_API_SECRET)}`); }
  }
  if (carrier === 'foxpost') {
    if (env.FOXPOST_API_KEY && args.credentials?.apiKey) { applied.push('FOXPOST_API_KEY'); masked.push(`FOXPOST_API_KEY=${mask(env.FOXPOST_API_KEY)}`); }
    if (env.FOXPOST_BASIC_USERNAME && args.credentials?.basicUsername) { applied.push('FOXPOST_BASIC_USERNAME'); masked.push(`FOXPOST_BASIC_USERNAME=${mask(env.FOXPOST_BASIC_USERNAME)}`); }
    if (env.FOXPOST_BASIC_PASSWORD && args.credentials?.basicPassword) { applied.push('FOXPOST_BASIC_PASSWORD'); masked.push(`FOXPOST_BASIC_PASSWORD=${mask(env.FOXPOST_BASIC_PASSWORD)}`); }
  } else if (carrier === 'gls') {
    if (env.GLS_USERNAME && args.credentials?.username) { applied.push('GLS_USERNAME'); masked.push(`GLS_USERNAME=${mask(env.GLS_USERNAME)}`); }
    if (env.GLS_PASSWORD && args.credentials?.password) { applied.push('GLS_PASSWORD'); masked.push(`GLS_PASSWORD=${mask(env.GLS_PASSWORD)}`); }
    if (env.GLS_CLIENT_ID && args.credentials?.clientNumberList) { applied.push('GLS_CLIENT_ID'); masked.push(`GLS_CLIENT_ID=${mask(env.GLS_CLIENT_ID)}`); }
  } else if (carrier === 'mpl') {
    if (env.MPL_ACCOUNTING_CODE) { applied.push('MPL_ACCOUNTING_CODE'); masked.push(`MPL_ACCOUNTING_CODE=${mask(env.MPL_ACCOUNTING_CODE)}`); }
    if (env.MPL_AGREEMENT_CODE) { applied.push('MPL_AGREEMENT_CODE'); masked.push(`MPL_AGREEMENT_CODE=${mask(env.MPL_AGREEMENT_CODE)}`); }
    if (env.MPL_MEGALLAPODASKOD) { applied.push('MPL_MEGALLAPODASKOD'); masked.push(`MPL_MEGALLAPODASKOD=${mask(env.MPL_MEGALLAPODASKOD)}`); }
    if (env.MPL_BANK_ACCOUNT_NUMBER) { applied.push('MPL_BANK_ACCOUNT_NUMBER'); masked.push(`MPL_BANK_ACCOUNT_NUMBER=${mask(env.MPL_BANK_ACCOUNT_NUMBER)}`); }
  }
  if (useTestEnv) applied.push('USE_TEST_API');
  if (applied.length > 0) output?.info(`Applied env overrides: ${applied.join(', ')}${masked.length ? ` (${masked.join(', ')})` : ''}`);

  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  const logFilePath = getFlagValue(argv, ['--log-file']);
  const output = createCliOutput(logFilePath);

  // Prefer package-local .env (examples/functions/.env) so running from repo root
  // still loads the example credentials. Fall back to default dotenv behavior.
  const localEnvPath = path.join(FUNCTIONS_DIR, '.env');
  if (fs.existsSync(localEnvPath)) {
    loadEnv(localEnvPath);
    output.log(`Loaded env from ${localEnvPath}`);
    // Print detected relevant env vars (masked) for quick debugging
    try {
      const present: string[] = [];
      if (process.env.MPL_API_KEY) present.push(`MPL_API_KEY=${mask(process.env.MPL_API_KEY)}`);
      if (process.env.MPL_API_SECRET) present.push(`MPL_API_SECRET=${mask(process.env.MPL_API_SECRET)}`);
      if (process.env.MPL_OAUTH_TOKEN) present.push(`MPL_OAUTH_TOKEN=${mask(process.env.MPL_OAUTH_TOKEN)}`);
      if (process.env.MPL_ACCOUNTING_CODE) present.push(`MPL_ACCOUNTING_CODE=${mask(process.env.MPL_ACCOUNTING_CODE)}`);
      if (process.env.MPL_BANK_ACCOUNT_NUMBER) present.push(`MPL_BANK_ACCOUNT_NUMBER=${mask(process.env.MPL_BANK_ACCOUNT_NUMBER)}`);
      if (process.env.FOXPOST_API_KEY) present.push(`FOXPOST_API_KEY=${mask(process.env.FOXPOST_API_KEY)}`);
      if (process.env.FOXPOST_BASIC_USERNAME) present.push(`FOXPOST_BASIC_USERNAME=${mask(process.env.FOXPOST_BASIC_USERNAME)}`);
      if (process.env.FOXPOST_BASIC_PASSWORD) present.push(`FOXPOST_BASIC_PASSWORD=${mask(process.env.FOXPOST_BASIC_PASSWORD)}`);
      if (process.env.GLS_USERNAME) present.push(`GLS_USERNAME=${mask(process.env.GLS_USERNAME)}`);
      if (process.env.GLS_PASSWORD) present.push(`GLS_PASSWORD=${mask(process.env.GLS_PASSWORD)}`);
      if (process.env.GLS_CLIENT_ID) present.push(`GLS_CLIENT_ID=${mask(process.env.GLS_CLIENT_ID)}`);
      if (present.length > 0) output.info(`Detected env vars: ${present.join(', ')}`);
    } catch (e) {
      // ignore
    }
  } else {
    loadEnv();
  }
  const modules = discoverFunctions();

  // Simple argv parsing for --run and --args
  let runId: string | undefined;
  let argsInput: string | undefined;
  let useMock = false;
  let saveLabelOutputFlag = false;
  // Honor env alias FULL_LOGS=1 or FULL_LOGS=true for convenience
  let fullLogs = (process.env.FULL_LOGS === '1' || process.env.FULL_LOGS === 'true');
  // Honor exchange-first env alias (EXCHANGE_AUTH_FIRST)
  let exchangeFirst = (process.env.EXCHANGE_AUTH_FIRST === '1' || process.env.EXCHANGE_AUTH_FIRST === 'true');
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run' || a === '-r') {
      runId = argv[i + 1];
      i++;
    } else if (a.startsWith('--run=')) {
      runId = a.split('=')[1];
    } else if (a === '--args' || a === '-a') {
      argsInput = argv[i + 1];
      i++;
    } else if (a === '--mock' || a === '--use-mock') {
      useMock = true;
    } else if (a === '--save-label' || a === '--save-label-file') {
      saveLabelOutputFlag = true;
    } else if (a === '--full-logs' || a === '--log-full') {
      fullLogs = true;
    } else if (a === '--exchange-first' || a === '--refresh-token') {
      exchangeFirst = true;
    } else if (a.startsWith('--args=')) {
      argsInput = a.split('=')[1];
    } else if (a === '--help' || a === '-h') {
      output.log('Usage: cli.ts [--run <functionId>] [--args <json-or-path>] [--mock] [--save-label] [--full-logs] [--log-file <path>] [--exchange-first]');
      process.exit(0);
    }
  }

  if (runId) {
    try {
      let effectiveArgs = undefined;
      if (argsInput) {
        // load raw args (file or JSON); runModuleById will parse file/string
        const parsed = await (async () => {
          // Reuse parsing logic by calling runModuleById with a dummy run
          // But simpler: replicate parse logic here by calling runModuleById with empty args
          return undefined;
        })();
        effectiveArgs = argsInput;
      }

      // If argsInput provided, runModuleById will load and parse the file or JSON
      // After parsing, we apply env overrides inside runModuleById's returned args before executing
      const rawArgs = argsInput ? argsInput : undefined;
      let parsedArgs: any = undefined;
      if (rawArgs) {
        // Load the args the same way runModuleById does by invoking it in a preparatory manner
        // Instead, call runModuleById but intercept before execution is tricky; so parse here using its helper
        // We'll mimic parsing: try JSON.parse, then file candidates
        try {
          parsedArgs = JSON.parse(rawArgs);
        } catch (_) {
          // attempt file load
          const normalized = normalizeArgPath(rawArgs);
          const fp = findArgsFile(normalized);
          if (!fp) throw new Error(`Args file not found: ${rawArgs}`);
          parsedArgs = JSON.parse(fs.readFileSync(fp, 'utf8'));
        }
      }

      // Apply env overrides only inside runModuleById to avoid duplicate logs
      const result = await runModuleById(modules, runId, parsedArgs ? JSON.stringify(parsedArgs) : undefined, useMock, fullLogs, exchangeFirst, saveLabelOutputFlag, output);
      try {
        const redacted = redactLargeLabels(result);
        if (output.logFilePath) {
          output.writeSection('Result', result);
          output.log(`Result written to ${output.logFilePath}`);
          const summary = (redacted as any)?.summary || (redacted as any)?.message || (redacted as any)?.status;
          if (summary) output.log(`Result summary: ${String(summary)}`);
        } else {
          const pretty = serializeForLog(redacted);
          output.log(`Result: ${JSON.stringify(pretty, null, 2)}`);
        }
      } catch (_) {
        if (output.logFilePath) {
          output.writeSection('Result', result);
          output.log(`Result written to ${output.logFilePath}`);
        } else {
          output.log(`Result: ${JSON.stringify(result, null, 2)}`);
        }
      }
      process.exit(0);
    } catch (err) {
      if (fullLogs) {
        try {
          const pretty = serializeForLog(err);
          output.error('Error', JSON.stringify(pretty, null, 2));
        } catch (e) {
          output.error('Error', err);
        }
      } else {
        output.error('Error', err);
      }
      process.exit(1);
    }
  }

  // Interactive fallback
  const choices = modules.map((m) => ({ name: m.id, value: m }));
  const ans = await inquirer.prompt([{ type: 'list', name: 'sel', message: 'Select function to run', choices }]);

  const mod = await import(ans.sel.file);
  const meta = mod.meta || {};
  output.log(`Selected: ${meta.id || ans.sel.file} - ${meta.description || ''}`);

  const paramsAns = await inquirer.prompt([{ type: 'editor', name: 'args', message: 'Provide JSON args for run(args, ctx)' }]);
  const args = JSON.parse(paramsAns.args || '{}');

  const httpClient = createHttpClient({ logger: output ? wrapPinoLogger(output) : wrapPinoLogger(console as any) });
  const ctx = { adapterContext: buildAdapterContext(httpClient, output || wrapPinoLogger(console as any)) };

  const result = await mod.run(args, ctx);
  try {
    const redacted = redactLargeLabels(result);
    const pretty = serializeForLog(redacted);
    output.log(`Result: ${JSON.stringify(pretty, null, 2)}`);
  } catch (_) {
    output.log(`Result: ${JSON.stringify(result, null, 2)}`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
