/**
 * MPL Adapter - Validation Schema Tests
 *
 * Contract checks against the MPL OpenAPI spec
 * (carrier-docs/hu-mpl/hu-mpl.openapi.yaml). These exist because a cap that
 * is looser than MPL's own lets an invalid value through to the carrier,
 * which then rejects it with a Hungarian-language field error — a round trip
 * to discover something we could have caught locally.
 */

import { describe, it, expect } from 'vitest';
import { ContactSchema } from '../../validation.js';

describe('ContactSchema', () => {
  const valid = {
    name: 'Kovács János',
    phone: '+36201234567',
    email: 'kovacs@janos.hu',
  };

  it('accepts an E.164 Hungarian number', () => {
    expect(ContactSchema.safeParse(valid).success).toBe(true);
  });

  describe('phone (spec: maxLength 14, E.164)', () => {
    it('rejects a human-formatted number that exceeds MPL length', () => {
      // "+36 20 961 5039" is 15 characters. It passed the old max(20) cap
      // and was then rejected by MPL as `sender.contact.phone: 103`.
      const result = ContactSchema.safeParse({ ...valid, phone: '+36 20 961 5039' });

      expect(result.success).toBe(false);
    });

    it('accepts the E.164 form of that same number', () => {
      const result = ContactSchema.safeParse({ ...valid, phone: '+36209615039' });

      expect(result.success).toBe(true);
    });

    it('accepts a number exactly at the 14-character limit', () => {
      const fourteen = '+3620961503912';
      expect(fourteen).toHaveLength(14);
      expect(ContactSchema.safeParse({ ...valid, phone: fourteen }).success).toBe(true);
    });

    it('rejects one character over the limit', () => {
      const fifteen = '+36209615039123';
      expect(fifteen).toHaveLength(15);
      expect(ContactSchema.safeParse({ ...valid, phone: fifteen }).success).toBe(false);
    });

    it('is optional', () => {
      const { phone: _phone, ...withoutPhone } = valid;
      expect(ContactSchema.safeParse(withoutPhone).success).toBe(true);
    });
  });

  describe('email (spec: maxLength 60)', () => {
    it('accepts an address at the limit', () => {
      const local = 'a'.repeat(60 - '@example.com'.length);
      const email = `${local}@example.com`;
      expect(email).toHaveLength(60);
      expect(ContactSchema.safeParse({ ...valid, email }).success).toBe(true);
    });

    it('rejects an address over the limit', () => {
      const local = 'a'.repeat(61 - '@example.com'.length);
      const email = `${local}@example.com`;
      expect(email).toHaveLength(61);
      expect(ContactSchema.safeParse({ ...valid, email }).success).toBe(false);
    });
  });

  describe('name', () => {
    it('requires a name', () => {
      const { name: _name, ...withoutName } = valid;
      expect(ContactSchema.safeParse(withoutName).success).toBe(false);
      expect(ContactSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
    });

    it('caps the name at the 120 the spec documents for integrations', () => {
      // The spec's own `maxLength` is 150, but its description narrows that
      // to "►INT◄ MaxLength: 120" for integration clients.
      expect(ContactSchema.safeParse({ ...valid, name: 'a'.repeat(120) }).success).toBe(true);
      expect(ContactSchema.safeParse({ ...valid, name: 'a'.repeat(121) }).success).toBe(false);
    });
  });
});
