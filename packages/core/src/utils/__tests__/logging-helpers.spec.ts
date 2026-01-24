import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isSilentOperation,
  getLoggingOptions,
  truncateForLogging,
  summarizeRawResponse,
  safeLog,
  createLogEntry,
} from '../logging-helpers.js';
import type { AdapterContext, LoggingOptions, Logger } from '../../interfaces/index.js';

describe('Logging Helpers', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  describe('isSilentOperation', () => {
    it('should return false when no operation name', () => {
      const ctx: AdapterContext = {
        http: undefined,
      };
      expect(isSilentOperation(ctx)).toBe(false);
    });

    it('should return false when operation is not in silent list', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'createLabel',
      };
      expect(isSilentOperation(ctx, [])).toBe(false);
    });

    it('should return true when operation is in silent list', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'fetchPickupPoints',
      };
      expect(isSilentOperation(ctx, ['fetchPickupPoints'])).toBe(true);
    });

    it('should use context logging options over defaults', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'createLabel',
        loggingOptions: {
          silentOperations: ['createLabel'],
        },
      };
      expect(isSilentOperation(ctx, [])).toBe(true);
    });

    it('should merge context and default silent operations', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'trackParcel',
        loggingOptions: {
          silentOperations: ['trackParcel'],
        },
      };
      expect(isSilentOperation(ctx, ['fetchPickupPoints'])).toBe(true);
    });
  });

  describe('getLoggingOptions', () => {
    it('should return defaults when no options provided', () => {
      const ctx: AdapterContext = { http: undefined };
      const options = getLoggingOptions(ctx);
      expect(options).toEqual({
        maxArrayItems: 10,
        maxDepth: 2,
        logRawResponse: 'summary',
        logMetadata: false,
        silentOperations: [],
      });
    });

    it('should merge provided options with defaults', () => {
      const ctx: AdapterContext = {
        http: undefined,
        loggingOptions: {
          maxArrayItems: 5,
          logRawResponse: true,
        },
      };
      const options = getLoggingOptions(ctx);
      expect(options.maxArrayItems).toBe(5);
      expect(options.logRawResponse).toBe(true);
      expect(options.maxDepth).toBe(2); // default
    });

    it('should override all defaults when provided', () => {
      const ctx: AdapterContext = {
        http: undefined,
        loggingOptions: {
          maxArrayItems: 20,
          maxDepth: 5,
          logRawResponse: false,
          logMetadata: true,
          silentOperations: ['test'],
        },
      };
      const options = getLoggingOptions(ctx);
      expect(options).toEqual({
        maxArrayItems: 20,
        maxDepth: 5,
        logRawResponse: false,
        logMetadata: true,
        silentOperations: ['test'],
      });
    });
  });

  describe('truncateForLogging', () => {
    const options = getLoggingOptions({ http: undefined });

    it('should handle null and undefined', () => {
      expect(truncateForLogging(null, options)).toBe(null);
      expect(truncateForLogging(undefined, options)).toBe(undefined);
    });

    it('should handle primitives', () => {
      expect(truncateForLogging('test', options)).toBe('test');
      expect(truncateForLogging(42, options)).toBe(42);
      expect(truncateForLogging(true, options)).toBe(true);
    });

    it('should truncate arrays at maxArrayItems', () => {
      const arr = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      const optionsWithLimit = { ...options, maxArrayItems: 5 };
      const result = truncateForLogging(arr, optionsWithLimit);

      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).length).toBe(6); // 5 items + 1 truncation message
      expect((result as any[])[5]).toMatch(/\.\.\. and \d+ more items/);
    });

    it('should skip arrays when maxArrayItems is 0', () => {
      const arr = [1, 2, 3];
      const optionsNoArray = { ...options, maxArrayItems: 0 };
      const result = truncateForLogging(arr, optionsNoArray);

      expect(typeof result).toBe('string');
      expect(result).toMatch(/\[Array: 3 items/);
    });

    it('should respect maxDepth for nested objects', () => {
      const nested = {
        level1: {
          level2: {
            level3: {
              data: 'deep',
            },
          },
        },
      };
      const optionsShallow = { ...options, maxDepth: 2 };
      const result = truncateForLogging(nested, optionsShallow);

      expect(typeof (result as any).level1.level2).toBe('string');
      expect((result as any).level1.level2).toMatch(/\[Object:/);
    });

    it('should skip metadata when logMetadata is false', () => {
      const obj = {
        id: '123',
        metadata: { carrier: 'foxpost', apm_id: '456' },
      };
      const optionsNoMetadata = { ...options, logMetadata: false };
      const result = truncateForLogging(obj, optionsNoMetadata);

      expect(typeof (result as any).metadata).toBe('string');
      expect((result as any).metadata).toContain('omitted');
    });

    it('should include metadata when logMetadata is true', () => {
      const obj = {
        id: '123',
        metadata: { carrier: 'foxpost', apm_id: '456' },
      };
      const optionsWithMetadata = { ...options, logMetadata: true };
      const result = truncateForLogging(obj, optionsWithMetadata);

      expect(typeof (result as any).metadata).toBe('object');
      expect((result as any).metadata.carrier).toBe('foxpost');
    });

    it('should handle mixed nested structures', () => {
      const complex = {
        items: Array.from({ length: 15 }, (_, i) => ({ id: i, nested: { data: 'x' } })),
        metadata: { count: 15 },
        info: 'test',
      };
      const optionsLimited = { ...options, maxArrayItems: 3, logMetadata: false, maxDepth: 2 };
      const result = truncateForLogging(complex, optionsLimited) as any;

      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(4); // 3 + truncation message
      expect(typeof result.metadata).toBe('string');
      expect(result.info).toBe('test');
    });

    it('should increment currentDepth correctly', () => {
      const nested = {
        a: {
          b: {
            c: {
              d: { value: 'deep' },
            },
          },
        },
      };
      const optionsTiny = { ...options, maxDepth: 1 };
      const result = truncateForLogging(nested, optionsTiny);

      expect(typeof (result as any).a).toBe('string');
      expect((result as any).a).toMatch(/\[Object:/);
    });
  });

  describe('summarizeRawResponse', () => {
    it('should handle undefined', () => {
      const result = summarizeRawResponse(undefined);
      expect(result.message).toBe('No raw response');
    });

    it('should handle null', () => {
      const result = summarizeRawResponse(null);
      expect(result.message).toBe('No raw response');
    });

    it('should summarize array responses', () => {
      const arr = [
        { id: '1', name: 'APM 1', lat: 47.5, lng: 19.0 },
        { id: '2', name: 'APM 2', lat: 47.6, lng: 19.1 },
        { id: '3', name: 'APM 3', lat: 47.7, lng: 19.2 },
      ];
      const result = summarizeRawResponse(arr);

      expect(result.type).toBe('array');
      expect(result.count).toBe(3);
      expect(Array.isArray(result.itemKeys)).toBe(true);
      expect(result.itemCount).toBe(4); // id, name, lat, lng
    });

    it('should limit itemKeys to 5 for arrays', () => {
      const arr = [
        { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 },
      ];
      const result = summarizeRawResponse(arr);

      expect(result.itemKeys.length).toBeLessThanOrEqual(5);
    });

    it('should summarize object responses', () => {
      const obj = {
        id: '123',
        name: 'Test',
        data: 'value',
        nested: { foo: 'bar' },
      };
      const result = summarizeRawResponse(obj);

      expect(result.type).toBe('object');
      expect(result.keyCount).toBe(4);
      expect(Array.isArray(result.keys)).toBe(true);
    });

    it('should limit keys to 10 for objects', () => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < 20; i++) {
        obj[`key${i}`] = i;
      }
      const result = summarizeRawResponse(obj);

      expect(result.keys.length).toBeLessThanOrEqual(10);
    });

    it('should handle string responses', () => {
      const result = summarizeRawResponse('test string');
      expect(result.type).toBe('string');
      expect(result.value).toBe('test string');
    });

    it('should truncate long string values to 100 chars', () => {
      const longString = 'x'.repeat(200);
      const result = summarizeRawResponse(longString);

      expect(result.value.length).toBe(100);
    });

    it('should handle empty arrays', () => {
      const result = summarizeRawResponse([]);
      expect(result.type).toBe('array');
      expect(result.count).toBe(0);
      expect(result.itemKeys).toEqual([]);
    });

    it('should handle empty objects', () => {
      const result = summarizeRawResponse({});
      expect(result.type).toBe('object');
      expect(result.keyCount).toBe(0);
      expect(result.keys).toEqual([]);
    });
  });

  describe('safeLog', () => {
    it('should not log when logger is undefined', () => {
      const ctx: AdapterContext = { http: undefined };
      safeLog(undefined, 'info', 'test', { data: 'value' }, ctx);
      // Should not throw
    });

    it('should not log when operation is silent', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'fetchPickupPoints',
      };
      safeLog(mockLogger, 'info', 'test', { data: 'value' }, ctx, ['fetchPickupPoints']);

      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should log at correct level', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'createLabel',
      };
      safeLog(mockLogger, 'info', 'Label created', { id: '123' }, ctx);

      expect(mockLogger.info).toHaveBeenCalledWith('Label created', expect.any(Object));
    });

    it('should remove raw when logRawResponse is false', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
        loggingOptions: { logRawResponse: false },
      };
      const data = { id: '123', raw: { full: 'response' } };
      safeLog(mockLogger, 'debug', 'test', data, ctx);

      const call = (mockLogger.debug as any).mock.calls[0];
      expect(call[1].raw).toBeUndefined();
    });

    it('should summarize raw when logRawResponse is summary', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
        loggingOptions: { logRawResponse: 'summary' },
      };
      const data = {
        id: '123',
        raw: [{ a: 1 }, { b: 2 }, { c: 3 }],
      };
      safeLog(mockLogger, 'debug', 'test', data, ctx);

      const call = (mockLogger.debug as any).mock.calls[0];
      expect(call[1].raw.type).toBe('array');
      expect(call[1].raw.count).toBe(3);
    });

    it('should truncate raw when logRawResponse is true', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
        loggingOptions: { logRawResponse: true, maxArrayItems: 2 },
      };
      const data = {
        id: '123',
        raw: [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }],
      };
      safeLog(mockLogger, 'debug', 'test', data, ctx);

      const call = (mockLogger.debug as any).mock.calls[0];
      expect(Array.isArray(call[1].raw)).toBe(true);
      expect((call[1].raw as any[]).length).toBe(3); // 2 items + truncation message
    });

    it('should handle rawCarrierResponse field', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
        loggingOptions: { logRawResponse: 'summary' },
      };
      const data = {
        id: '123',
        rawCarrierResponse: [{ x: 1 }, { y: 2 }],
      };
      safeLog(mockLogger, 'debug', 'test', data, ctx);

      const call = (mockLogger.debug as any).mock.calls[0];
      expect(call[1].rawCarrierResponse.type).toBe('array');
      expect(call[1].rawCarrierResponse.count).toBe(2);
    });

    it('should truncate all object fields', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
        loggingOptions: { maxDepth: 1 },
      };
      const data = {
        id: '123',
        nested: {
          level1: {
            level2: { value: 'deep' },
          },
        },
      };
      safeLog(mockLogger, 'debug', 'test', data, ctx);

      const call = (mockLogger.debug as any).mock.calls[0];
      expect(typeof call[1].nested).toBe('object');
      expect(typeof call[1].nested.level1).toBe('string');
    });

    it('should preserve underscore-prefixed fields', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
      };
      const data = {
        id: '123',
        _internal: { deep: { data: 'value' } },
      };
      safeLog(mockLogger, 'debug', 'test', data, ctx);

      const call = (mockLogger.debug as any).mock.calls[0];
      expect(typeof call[1]._internal).toBe('object');
    });

    it('should handle multiple operations in silent list', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'trackParcel',
      };
      safeLog(
        mockLogger,
        'debug',
        'test',
        { data: 'value' },
        ctx,
        ['fetchPickupPoints', 'trackParcel', 'createLabel']
      );

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should call logger with all levels', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
      };

      safeLog(mockLogger, 'debug', 'debug msg', { data: 'value' }, ctx);
      safeLog(mockLogger, 'info', 'info msg', { data: 'value' }, ctx);
      safeLog(mockLogger, 'warn', 'warn msg', { data: 'value' }, ctx);
      safeLog(mockLogger, 'error', 'error msg', { data: 'value' }, ctx);

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createLogEntry', () => {
    it('should return suppressed entry when operation is silent', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'fetchPickupPoints',
      };
      const result = createLogEntry(
        { action: 'fetch' },
        [{ id: 1 }, { id: 2 }],
        ctx,
        ['fetchPickupPoints']
      );

      expect(result.suppressed).toBe(true);
      expect(result.reason).toBe('Silent operation');
    });

    it('should include base info', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'createLabel',
      };
      const result = createLogEntry(
        { action: 'create', parcelId: '123' },
        { id: 'label-1' },
        ctx
      );

      expect(result.action).toBe('create');
      expect(result.parcelId).toBe('123');
    });

    it('should add responseCount for array responses', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
      };
      const response = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = createLogEntry({ action: 'fetch' }, response, ctx);

      expect(result.responseCount).toBe(3);
    });

    it('should add responseSample for array responses', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
        loggingOptions: { maxArrayItems: 5 },
      };
      const response = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const result = createLogEntry({ action: 'fetch' }, response, ctx);

      expect(Array.isArray(result.responseSample)).toBe(true);
      expect(result.responseSample.length).toBeLessThanOrEqual(2);
    });

    it('should skip responseSample when maxArrayItems is 0', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
        loggingOptions: { maxArrayItems: 0 },
      };
      const response = [{ id: 1 }, { id: 2 }];
      const result = createLogEntry({ action: 'fetch' }, response, ctx);

      expect(result.responseSample).toBeUndefined();
    });

    it('should add responseKeys for object responses', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
      };
      const response = {
        id: '123',
        name: 'Test',
        status: 'created',
        carrier: 'foxpost',
        metadata: { apm_id: '456' },
      };
      const result = createLogEntry({ action: 'create' }, response, ctx);

      expect(Array.isArray(result.responseKeys)).toBe(true);
      expect(result.responseKeyCount).toBe(5);
    });

    it('should limit responseKeys to 5', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
      };
      const response: Record<string, any> = {};
      for (let i = 0; i < 20; i++) {
        response[`key${i}`] = i;
      }
      const result = createLogEntry({ action: 'fetch' }, response, ctx);

      expect(result.responseKeys.length).toBeLessThanOrEqual(5);
    });

    it('should handle undefined response', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
      };
      const result = createLogEntry({ action: 'test' }, undefined, ctx);

      expect(result.action).toBe('test');
      expect(result.responseCount).toBeUndefined();
      expect(result.responseKeys).toBeUndefined();
    });

    it('should handle null response', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
      };
      const result = createLogEntry({ action: 'test' }, null, ctx);

      expect(result.action).toBe('test');
      expect(result.responseCount).toBeUndefined();
    });

    it('should respect loggingOptions in context', () => {
      const ctx: AdapterContext = {
        http: undefined,
        operationName: 'test',
        loggingOptions: { maxArrayItems: 2 },
      };
      const response = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const result = createLogEntry({ action: 'fetch' }, response, ctx);

      expect(result.responseSample.length).toBeLessThanOrEqual(2);
    });
  });
});
