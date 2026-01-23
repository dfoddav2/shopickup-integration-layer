import { describe, it, expect } from 'vitest';
import { serializeForLog, truncateString, sanitizeHeadersForLog, errorToLog } from '../logging.js';

describe('Logging Utilities', () => {
  describe('serializeForLog', () => {
    it('should return primitives unchanged', () => {
      expect(serializeForLog(null)).toBe(null);
      expect(serializeForLog(undefined)).toBe(undefined);
      expect(serializeForLog(42)).toBe(42);
      expect(serializeForLog('hello')).toBe('hello');
      expect(serializeForLog(true)).toBe(true);
    });

    it('should safely serialize objects', () => {
      const obj = { name: 'test', value: 123, nested: { key: 'value' } };
      const result = serializeForLog(obj);
      expect(result).toEqual(obj);
    });

    it('should safely serialize arrays', () => {
      const arr = [1, 2, { key: 'value' }, 'test'];
      const result = serializeForLog(arr);
      expect(result).toEqual(arr);
    });

    it('should handle circular references', () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // Create circular reference

      const result = serializeForLog(obj);
      expect(typeof result).toBe('string');
      expect(result).toContain('Unserializable object');
    });

    it('should handle objects with undefined values', () => {
      const obj = { name: 'test', value: undefined, nested: { key: 'value' } };
      const result = serializeForLog(obj);
      // JSON.stringify removes undefined values
      expect(result).toEqual({ name: 'test', nested: { key: 'value' } });
    });

    it('should handle functions in objects by removing them', () => {
      const obj: any = {
        name: 'test',
        method: () => 'hello',
        nested: { key: 'value' },
      };
      const result = serializeForLog(obj);
      // JSON.stringify removes functions
      expect(result).toEqual({ name: 'test', nested: { key: 'value' } });
    });
  });

  describe('truncateString', () => {
    it('should return string unchanged if below max length', () => {
      const str = 'hello world';
      expect(truncateString(str, 50)).toBe('hello world');
    });

    it('should truncate string at max length with ellipsis', () => {
      const str = 'this is a very long string';
      const result = truncateString(str, 10);
      expect(result).toBe('this is a ...'); // 10 chars + '...'
      expect(result.length).toBe(13);
    });

    it('should use default max length of 500', () => {
      const str = 'a'.repeat(600);
      const result = truncateString(str);
      expect(result.length).toBe(503); // 500 + '...'
      expect(result).toContain('...');
    });

    it('should handle empty strings', () => {
      expect(truncateString('', 10)).toBe('');
    });
  });

  describe('sanitizeHeadersForLog', () => {
    it('should return undefined if input is undefined', () => {
      expect(sanitizeHeadersForLog(undefined)).toBeUndefined();
    });

    it('should preserve non-sensitive headers', () => {
      const headers = {
        'content-type': 'application/json',
        'content-length': '1024',
        'user-agent': 'test-agent',
      };
      const result = sanitizeHeadersForLog(headers);
      expect(result).toEqual(headers);
    });

    it('should redact sensitive headers', () => {
      const headers = {
        'content-type': 'application/json',
        'authorization': 'Bearer token123',
        'api-key': 'secret123',
      };
      const result = sanitizeHeadersForLog(headers);
      expect(result).toEqual({
        'content-type': 'application/json',
        'authorization': 'REDACTED',
        'api-key': 'REDACTED',
      });
    });

    it('should be case-insensitive for sensitive headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123',
        'API-KEY': 'secret123',
        'X-API-Key': 'another-secret',
      };
      const result = sanitizeHeadersForLog(headers);
      expect(result).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'REDACTED',
        'API-KEY': 'REDACTED',
        'X-API-Key': 'REDACTED',
      });
    });

    it('should redact common sensitive headers', () => {
      const headers = {
        'authorization': 'Bearer token',
        'api-key': 'key',
        'x-api-key': 'key',
        'password': 'pass',
        'token': 'token',
        'cookie': 'session=123',
        'set-cookie': 'session=456',
      };
      const result = sanitizeHeadersForLog(headers);
      for (const value of Object.values(result!)) {
        expect(value).toBe('REDACTED');
      }
    });
  });

  describe('errorToLog', () => {
    it('should convert Error instances to log objects', () => {
      const error = new Error('Test error');
      const result = errorToLog(error);

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('message', 'Test error');
      expect(result).toHaveProperty('stack');
      expect(result.type).toBe('Error');
    });

    it('should handle different error types', () => {
      const typeError = new TypeError('Type error message');
      const result = errorToLog(typeError);

      expect(result.type).toBe('TypeError');
      expect(result.message).toBe('Type error message');
      expect(result).toHaveProperty('stack');
    });

    it('should handle plain objects', () => {
      const obj = { code: 'ERR_123', details: 'Something went wrong' };
      const result = errorToLog(obj);

      expect(result).toEqual(obj);
    });

    it('should handle objects with circular references', () => {
      const obj: any = { message: 'error' };
      obj.self = obj;
      const result = errorToLog(obj);

      // serializeForLog returns a string for circular refs, which becomes the result
      expect(typeof result).toBe('string');
      expect(result).toContain('Unserializable object');
    });

    it('should handle string errors', () => {
      const result = errorToLog('string error');

      expect(result).toHaveProperty('type', 'string');
      expect(result).toHaveProperty('message', 'string error');
    });

    it('should handle number errors', () => {
      const result = errorToLog(42);

      expect(result).toHaveProperty('type', 'number');
      expect(result).toHaveProperty('message', '42');
    });

    it('should handle null and undefined', () => {
      expect(errorToLog(null)).toHaveProperty('message', 'null');
      expect(errorToLog(undefined)).toHaveProperty('message', 'undefined');
    });
  });
});
