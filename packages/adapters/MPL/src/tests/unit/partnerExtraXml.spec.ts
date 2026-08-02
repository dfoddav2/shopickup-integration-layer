import { describe, it, expect } from 'vitest';
import {
  parsePartnerExtraPostInfo,
  extractPartnerExtraPosts,
  extractPartnerExtraWorkingHoursDays,
  normalizePartnerExtraWorkingHours,
  parseHungarianDecimal,
} from '../../utils/partnerExtraXml.js';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<postInfo timestamp="2024-01-01T00:00:00">
  <post isPostPoint="1" zipCode="4955">
    <ID>107264</ID>
    <name>Botpalád postapartner</name>
    <city>Botpalád</city>
    <street>
      <name>Fő</name>
      <type>utca</type>
      <houseNumber>124</houseNumber>
    </street>
    <gpsData>
      <EOVx>305057</EOVx>
      <EOVy>930326</EOVy>
      <WGSLat>48,028436</WGSLat>
      <WGSLon>22,807174</WGSLon>
    </gpsData>
    <phoneArea>1-767-8272</phoneArea>
    <workingHours culture="HU">
      <days>
        <day>Hétfő</day>
        <From1>08:00</From1>
        <To1>10:00</To1>
      </days>
      <days>
        <day>Kedd</day>
        <From1>08:00</From1>
        <To1>10:00</To1>
      </days>
    </workingHours>
    <description>N/A</description>
    <email>uzleti.ugyfelszolgalat@posta.hu</email>
    <ServicePointType>PM</ServicePointType>
  </post>
  <post isPostPoint="0" zipCode="1062">
    <ID>111</ID>
    <name>Budapest Posta 62</name>
    <city>Budapest</city>
  </post>
</postInfo>`;

describe('MPL PartnerExtra XML parsing', () => {
  describe('parsePartnerExtraPostInfo', () => {
    it('parses the postInfo root and exposes its timestamp attribute', () => {
      const postInfo = parsePartnerExtraPostInfo(SAMPLE_XML);
      expect(postInfo).toBeDefined();
      expect(postInfo['@_timestamp']).toBe('2024-01-01T00:00:00');
    });

    it('throws on empty or non-XML input', () => {
      expect(() => parsePartnerExtraPostInfo('')).toThrow();
      expect(() => parsePartnerExtraPostInfo('not xml at all')).toThrow();
    });

    it('throws on malformed XML', () => {
      expect(() => parsePartnerExtraPostInfo('<postInfo><post></postInfo>')).toThrow();
    });
  });

  describe('extractPartnerExtraPosts', () => {
    it('handles multiple <post> entries', () => {
      const postInfo = parsePartnerExtraPostInfo(SAMPLE_XML);
      const posts = extractPartnerExtraPosts(postInfo);
      expect(posts).toHaveLength(2);
      expect(posts[0].ID).toBe('107264');
      expect(posts[1].ID).toBe('111');
    });

    it('handles a single <post> entry (object, not array)', () => {
      const xml = `<postInfo timestamp="t"><post><ID>1</ID></post></postInfo>`;
      const postInfo = parsePartnerExtraPostInfo(xml);
      const posts = extractPartnerExtraPosts(postInfo);
      expect(posts).toHaveLength(1);
      expect(posts[0].ID).toBe('1');
    });

    it('returns an empty array when no posts exist', () => {
      const postInfo = parsePartnerExtraPostInfo('<postInfo></postInfo>');
      expect(extractPartnerExtraPosts(postInfo)).toEqual([]);
    });
  });

  describe('extractPartnerExtraWorkingHoursDays', () => {
    it('extracts all working-hours days as an array', () => {
      const postInfo = parsePartnerExtraPostInfo(SAMPLE_XML);
      const posts = extractPartnerExtraPosts(postInfo);
      const days = extractPartnerExtraWorkingHoursDays(posts[0]);
      expect(days).toHaveLength(2);
      expect(days[0].day).toBe('Hétfő');
      expect(days[0].From1).toBe('08:00');
      expect(days[0].To1).toBe('10:00');
      expect(days[1].day).toBe('Kedd');
    });

    it('handles a single <days> element (object, not array)', () => {
      const xml = `<postInfo><post><workingHours><days><day>Szombat</day><From1>09:00</From1><To1>12:00</To1></days></workingHours></post></postInfo>`;
      const postInfo = parsePartnerExtraPostInfo(xml);
      const posts = extractPartnerExtraPosts(postInfo);
      const days = extractPartnerExtraWorkingHoursDays(posts[0]);
      expect(days).toHaveLength(1);
      expect(days[0].day).toBe('Szombat');
    });

    it('returns an empty array when no working hours are present', () => {
      const postInfo = parsePartnerExtraPostInfo(SAMPLE_XML);
      const posts = extractPartnerExtraPosts(postInfo);
      const days = extractPartnerExtraWorkingHoursDays(posts[1]);
      expect(days).toEqual([]);
    });
  });

  describe('normalizePartnerExtraWorkingHours', () => {
    it('maps Hungarian day names to canonical English names with "HH:MM - HH:MM"', () => {
      const days = [
        { day: 'Hétfő', From1: '08:00', To1: '10:00' },
        { day: 'Kedd', From1: '08:00', To1: '10:00' },
      ];
      expect(normalizePartnerExtraWorkingHours(days)).toEqual({
        Monday: '08:00 - 10:00',
        Tuesday: '08:00 - 10:00',
      });
    });

    it('joins a second interval (From2/To2) with ", "', () => {
      const days = [
        { day: 'Szerda', From1: '07:00', To1: '12:00', From2: '12:30', To2: '15:00' },
      ];
      expect(normalizePartnerExtraWorkingHours(days)).toEqual({
        Wednesday: '07:00 - 12:00, 12:30 - 15:00',
      });
    });

    it('handles all seven weekdays', () => {
      const days = [
        { day: 'Hétfő', From1: '08:00', To1: '10:00' },
        { day: 'Kedd', From1: '08:00', To1: '10:00' },
        { day: 'Szerda', From1: '08:00', To1: '10:00' },
        { day: 'Csütörtök', From1: '08:00', To1: '10:00' },
        { day: 'Péntek', From1: '08:00', To1: '10:00' },
        { day: 'Szombat', From1: '08:00', To1: '10:00' },
        { day: 'Vasárnap', From1: '08:00', To1: '10:00' },
      ];
      const result = normalizePartnerExtraWorkingHours(days);
      expect(Object.keys(result!)).toEqual([
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      ]);
    });

    it('handles unaccented Hungarian day names', () => {
      const days = [
        { day: 'Pentek', From1: '08:00', To1: '10:00' },
        { day: 'Vasarnap', From1: '08:00', To1: '10:00' },
      ];
      expect(normalizePartnerExtraWorkingHours(days)).toEqual({
        Friday: '08:00 - 10:00',
        Sunday: '08:00 - 10:00',
      });
    });

    it('omits days with missing intervals', () => {
      const days = [
        { day: 'Hétfő', From1: '08:00', To1: '10:00' },
        { day: 'Kedd' },
      ];
      expect(normalizePartnerExtraWorkingHours(days)).toEqual({
        Monday: '08:00 - 10:00',
      });
    });

    it('returns undefined when no open days are present', () => {
      expect(normalizePartnerExtraWorkingHours([])).toBeUndefined();
      expect(normalizePartnerExtraWorkingHours([{ day: 'Hétfő' }])).toBeUndefined();
    });
  });

  describe('parseHungarianDecimal', () => {
    it('parses comma-separated decimals (Hungarian locale)', () => {
      expect(parseHungarianDecimal('48,028436')).toBe(48.028436);
      expect(parseHungarianDecimal('22,807174')).toBe(22.807174);
    });

    it('parses dot-separated decimals', () => {
      expect(parseHungarianDecimal('47.4979')).toBe(47.4979);
    });

    it('parses integers', () => {
      expect(parseHungarianDecimal('305057')).toBe(305057);
    });

    it('returns undefined for empty or missing values', () => {
      expect(parseHungarianDecimal(undefined)).toBeUndefined();
      expect(parseHungarianDecimal('')).toBeUndefined();
      expect(parseHungarianDecimal('   ')).toBeUndefined();
    });

    it('returns undefined for unparseable values', () => {
      expect(parseHungarianDecimal('abc')).toBeUndefined();
    });
  });
});
