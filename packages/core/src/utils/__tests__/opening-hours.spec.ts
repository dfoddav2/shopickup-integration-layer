import { describe, it, expect } from 'vitest';
import {
  WEEKDAY_NAMES,
  formatOpenInterval,
  buildOpeningHours,
  normalizeHungarianDayName,
  normalizeTimeRange,
} from '../opening-hours.js';

describe('Opening Hours Utilities', () => {
  describe('normalizeHungarianDayName', () => {
    it('should map accented Hungarian day names to English', () => {
      expect(normalizeHungarianDayName('Hétfő')).toBe('Monday');
      expect(normalizeHungarianDayName('Csütörtök')).toBe('Thursday');
      expect(normalizeHungarianDayName('Vasárnap')).toBe('Sunday');
    });

    it('should map unaccented and lower-case variants', () => {
      expect(normalizeHungarianDayName('hetfo')).toBe('Monday');
      expect(normalizeHungarianDayName('CSUTORTOK')).toBe('Thursday');
      expect(normalizeHungarianDayName('vasarnap')).toBe('Sunday');
    });

    it('should return undefined for unknown or empty values', () => {
      expect(normalizeHungarianDayName('monday')).toBeUndefined();
      expect(normalizeHungarianDayName('')).toBeUndefined();
      expect(normalizeHungarianDayName(undefined)).toBeUndefined();
    });
  });

  describe('normalizeTimeRange', () => {
    it('should normalize compact ranges', () => {
      expect(normalizeTimeRange('08:00-18:00')).toEqual({ from: '08:00', to: '18:00' });
      expect(normalizeTimeRange('00:00-24:00')).toEqual({ from: '00:00', to: '24:00' });
    });

    it('should pad single-digit hours', () => {
      expect(normalizeTimeRange('8:00-18:00')).toEqual({ from: '08:00', to: '18:00' });
      expect(normalizeTimeRange('7:00-13:00')).toEqual({ from: '07:00', to: '13:00' });
    });

    it('should accept ranges with spaces around the separator', () => {
      expect(normalizeTimeRange('08:00 - 18:00')).toEqual({ from: '08:00', to: '18:00' });
    });

    it('should return undefined for unparseable values', () => {
      expect(normalizeTimeRange('-')).toBeUndefined();
      expect(normalizeTimeRange('24h')).toBeUndefined();
      expect(normalizeTimeRange('')).toBeUndefined();
      expect(normalizeTimeRange(undefined as any)).toBeUndefined();
    });
  });

  describe('formatOpenInterval', () => {
    it('should format as "HH:MM - HH:MM"', () => {
      expect(formatOpenInterval('08:00', '18:00')).toBe('08:00 - 18:00');
    });
  });

  describe('buildOpeningHours', () => {
    it('should build canonical map keyed by English weekday', () => {
      const result = buildOpeningHours({
        Monday: [{ from: '08:00', to: '18:00' }],
        Friday: [
          { from: '09:00', to: '12:00' },
          { from: '13:00', to: '17:00' },
        ],
      });

      expect(result).toEqual({
        Monday: '08:00 - 18:00',
        Friday: '09:00 - 12:00, 13:00 - 17:00',
      });
    });

    it('should omit closed/empty days and honor WEEKDAY_NAMES ordering', () => {
      const result = buildOpeningHours({
        Monday: [{ from: '08:00', to: '18:00' }],
        Tuesday: undefined,
        Wednesday: [],
        Bogus: [{ from: '08:00', to: '18:00' }],
      });

      expect(result).toEqual({ Monday: '08:00 - 18:00' });
      expect(WEEKDAY_NAMES).toContain('Monday');
      expect(WEEKDAY_NAMES).toContain('Sunday');
    });

    it('should return undefined when no day is open', () => {
      expect(buildOpeningHours({})).toBeUndefined();
      expect(buildOpeningHours({ Monday: [] })).toBeUndefined();
      expect(buildOpeningHours({ Monday: [{ from: '', to: '' }] })).toBeUndefined();
    });
  });
});
