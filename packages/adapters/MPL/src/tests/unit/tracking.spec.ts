/**
 * MPL Adapter - Tracking Mapper Tests
 *
 * Tests for C43/C9 -> canonical TrackingStatus classification, based on the
 * real event vocabulary in docs/carrier-docs/hu-mpl/raw/Nyomkovetesi_esemenyek.pdf.
 */

import { describe, it, expect } from 'vitest';
import { mapMPLTrackingToCanonical } from '../../mappers/tracking.js';
import type { MPLTrackingRecord } from '../../mappers/tracking.js';

function record(c43: string, c9: string): MPLTrackingRecord {
  return { c1: 'TEST123', c43, c9 };
}

describe('MPL Tracking Mapper - mapC43ToStatus (via mapMPLTrackingToCanonical)', () => {
  it('maps category 5 to DELIVERED', () => {
    expect(mapMPLTrackingToCanonical(record('5', 'Sikeresen kézbesítve')).status).toBe(
      'DELIVERED',
    );
  });

  it('maps category 4 to OUT_FOR_DELIVERY regardless of C9 text', () => {
    expect(
      mapMPLTrackingToCanonical(record('4', 'A küldemény a kézbesítőnél van')).status,
    ).toBe('OUT_FOR_DELIVERY');
    expect(
      mapMPLTrackingToCanonical(record('4', 'A küldemény postán átvehető')).status,
    ).toBe('OUT_FOR_DELIVERY');
  });

  describe('category 3 (Szállítás/Transport)', () => {
    it('maps plain transit text to IN_TRANSIT', () => {
      expect(mapMPLTrackingToCanonical(record('3', 'A küldemény szállítás alatt')).status).toBe(
        'IN_TRANSIT',
      );
    });

    it('maps sender-recall / refusal text to RETURNED', () => {
      expect(
        mapMPLTrackingToCanonical(record('3', 'A küldemény nem kézbesíthető (a feladó visszakérte)'))
          .status,
      ).toBe('RETURNED');
      expect(
        mapMPLTrackingToCanonical(record('3', 'A küldemény nem kézbesíthető (átvételt megtagadta)'))
          .status,
      ).toBe('RETURNED');
    });

    it('maps damage / defunct-address / obstructed text to EXCEPTION', () => {
      expect(
        mapMPLTrackingToCanonical(record('3', 'A küldemény nem kézbesíthető (sérülés miatt)')).status,
      ).toBe('EXCEPTION');
      expect(
        mapMPLTrackingToCanonical(record('3', 'A küldemény nem kézbesíthető (cég megszűnt)')).status,
      ).toBe('EXCEPTION');
      expect(
        mapMPLTrackingToCanonical(record('3', 'A küldemény nem kézbesíthető (kézbesítés akadályozott)'))
          .status,
      ).toBe('EXCEPTION');
      expect(
        mapMPLTrackingToCanonical(
          record('3', 'A küldemény nem kézbesíthető (címzett és feladó ismeretlen)'),
        ).status,
      ).toBe('EXCEPTION');
    });

    it('maps previously-uncaught undeliverable variants to EXCEPTION (regression)', () => {
      expect(
        mapMPLTrackingToCanonical(record('3', 'A küldemény nem kézbesíthető (elköltözött)')).status,
      ).toBe('EXCEPTION');
      expect(
        mapMPLTrackingToCanonical(
          record('3', 'A küldemény nem kézbesíthető (hibás vagy hiányos címzés)'),
        ).status,
      ).toBe('EXCEPTION');
      expect(
        mapMPLTrackingToCanonical(record('3', 'A küldemény nem kézbesíthető (nem kereste)')).status,
      ).toBe('EXCEPTION');
      expect(
        mapMPLTrackingToCanonical(record('3', 'A küldemény nem kézbesíthető (megőrzésre továbbítva)'))
          .status,
      ).toBe('EXCEPTION');
    });

    it('maps locker-to-post-office reroute text to IN_TRANSIT', () => {
      expect(
        mapMPLTrackingToCanonical(record('3', 'Csomagautomatából postára szállítva')).status,
      ).toBe('IN_TRANSIT');
      expect(
        mapMPLTrackingToCanonical(
          record('3', 'Csomagautomatából postára szállítva (lejárt őrzési idő miatt)'),
        ).status,
      ).toBe('IN_TRANSIT');
    });
  });

  describe('categories 0-2', () => {
    it('maps missing/0/1/2 to PENDING', () => {
      expect(mapMPLTrackingToCanonical(record('0', '')).status).toBe('PENDING');
      expect(mapMPLTrackingToCanonical(record('1', 'A küldeményt a feladótól átvettük')).status).toBe(
        'PENDING',
      );
      expect(mapMPLTrackingToCanonical(record('2', 'A küldemény feldolgozás alatt')).status).toBe(
        'PENDING',
      );
    });
  });
});
