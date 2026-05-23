/**
 * MPL Adapter - Shipment Mapper Tests
 *
 * Tests for dimension-to-size mapping and size override handling.
 */

import { describe, it, expect } from 'vitest';
import {
  mapItem,
  mapDimensionsToSize,
  mapParcelToMPLShipment,
  mapContact,
  mapAddress,
  mapSender,
  mapService,
} from '../../mappers/shipment.js';
import type { CreateParcelsMPLCarrierOptions } from '../../validation.js';

describe('MPL Shipment Mapper', () => {
  describe('mapDimensionsToSize', () => {
    it('returns S for max dimension <= 38 cm', () => {
      expect(mapDimensionsToSize({ length: 30, width: 20, height: 10 })).toBe('S');
      expect(mapDimensionsToSize({ length: 38, width: 10, height: 5 })).toBe('S');
    });

    it('returns M for max dimension <= 60 cm', () => {
      expect(mapDimensionsToSize({ length: 45, width: 30, height: 20 })).toBe('M');
      expect(mapDimensionsToSize({ length: 60, width: 10, height: 5 })).toBe('M');
    });

    it('returns L for max dimension > 60 cm', () => {
      expect(mapDimensionsToSize({ length: 70, width: 40, height: 30 })).toBe('L');
      expect(mapDimensionsToSize({ length: 100, width: 50, height: 20 })).toBe('L');
    });
  });

  describe('mapItem', () => {
    it('derives size from dimensions when no override', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 1200, dimensionsCm: { length: 20, width: 15, height: 8 } },
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any);

      expect(item.size).toBe('S');
      expect(item.weight).toEqual({ value: 1200, unit: 'g' });
    });

    it('uses explicit size override when provided', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 1200, dimensionsCm: { length: 20, width: 15, height: 8 } },
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any, 'L');

      expect(item.size).toBe('L');
    });

    it('uses override even when dimensions are missing', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 }, // No dimensions
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any, 'M');

      expect(item.size).toBe('M');
    });

    it('does not set size when no dimensions and no override', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 }, // No dimensions
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any);

      expect(item.size).toBeUndefined();
    });

    it('maps senderParcelPickupSite when provided', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 },
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any, undefined, 'Automata 123');

      expect(item.senderParcelPickupSite).toBe('Automata 123');
    });

    it('maps customsValue and customsValueCurrency when provided', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 },
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any, undefined, undefined, 150.5, 'EUR');

      expect(item.services.customsValue).toBe(150.5);
      expect(item.services.customsValueCurrency).toBe('EUR');
    });

    it('maps qrCode when provided', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 },
        service: 'standard' as const,
      };

      const item = mapItem(parcel as any, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'QR123');

      expect(item.qrCode).toBe('QR123');
    });

    it('maps all service-level options when provided', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 },
        service: 'standard' as const,
      };

      const item = mapItem(
        parcel as any,
        undefined,
        undefined,
        undefined,
        undefined,
        ['K_IDA', 'K_FNK'],
        2,
        '9022900',
        'semmi extra',
        true,
        '999',
      );

      expect(item.services.extra).toContain('K_IDA');
      expect(item.services.extra).toContain('K_FNK');
      expect(item.services.supplementarySheetNr).toBe(2);
      expect(item.services.exportAuthorisation).toBe('9022900');
      expect(item.services.otherComment).toBe('semmi extra');
      expect(item.services.secId).toBe(true);
      expect(item.services.produceContent).toBe('999');
    });
  });

  describe('mapService', () => {
    it('auto-adds K_UVT extra service when COD is present', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 },
        service: 'standard' as const,
        cod: { amount: { amount: 5000, currency: 'HUF' } },
      };

      const service = mapService(parcel as any);

      expect(service.extra).toContain('K_UVT');
      expect(service.cod).toBe(5000);
    });

    it('auto-adds K_ENY extra service when declaredValue is present', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 },
        service: 'standard' as const,
        declaredValue: { amount: 100000, currency: 'HUF' },
      };

      const service = mapService(parcel as any);

      expect(service.extra).toContain('K_ENY');
      expect(service.value).toBe(100000);
    });

    it('auto-adds K_TER extra service when fragile handling is present', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 },
        service: 'standard' as const,
        handling: { fragile: true },
      };

      const service = mapService(parcel as any);

      expect(service.extra).toContain('K_TER');
    });

    it('merges explicit extra services with auto-derived ones', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 },
        service: 'standard' as const,
        handling: { fragile: true },
      };

      const service = mapService(parcel as any, false, undefined, undefined, ['K_IDA']);

      expect(service.extra).toContain('K_TER');
      expect(service.extra).toContain('K_IDA');
    });

    it('does not duplicate auto-derived extras', () => {
      const parcel = {
        id: 'p1',
        shipper: {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        },
        recipient: {
          contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
          delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
        },
        package: { weightGrams: 500 },
        service: 'standard' as const,
        handling: { fragile: true },
      };

      const service = mapService(parcel as any, false, undefined, undefined, ['K_TER', 'K_IDA']);

      expect(service.extra?.filter((e: string) => e === 'K_TER')).toHaveLength(1);
      expect(service.extra).toContain('K_IDA');
    });
  });

  describe('mapContact', () => {
    it('maps company to organization', () => {
      const contact = mapContact({
        name: 'John Doe',
        phone: '+36301234567',
        email: 'john@example.com',
        company: 'Acme Inc',
      } as any);

      expect(contact.organization).toBe('Acme Inc');
    });

    it('allows missing company', () => {
      const contact = mapContact({
        name: 'John Doe',
        phone: '+36301234567',
      } as any);

      expect(contact.organization).toBeUndefined();
    });
  });

  describe('mapAddress', () => {
    it('maps remark when present on core address', () => {
      const address = mapAddress({
        name: 'Test',
        street: 'Main St 1',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        remark: 'Doorbell broken, please knock',
      } as any);

      expect(address.remark).toBe('Doorbell broken, please knock');
    });

    it('truncates remark to 50 chars', () => {
      const longRemark = 'A'.repeat(60);
      const address = mapAddress({
        name: 'Test',
        street: 'Main St 1',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        remark: longRemark,
      } as any);

      expect(address.remark).toHaveLength(50);
    });

    it('omits remark when not present', () => {
      const address = mapAddress({
        name: 'Test',
        street: 'Main St 1',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
      } as any);

      expect(address.remark).toBeUndefined();
    });
  });

  describe('mapSender', () => {
    it('includes parcelTerminal when provided', () => {
      const sender = mapSender(
        {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        } as any,
        '12345678',
        '123456781234567800000000',
        true,
      );

      expect(sender.parcelTerminal).toBe(true);
    });

    it('omits parcelTerminal when not provided', () => {
      const sender = mapSender(
        {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        } as any,
        '12345678',
        '123456781234567800000000',
      );

      expect(sender.parcelTerminal).toBeUndefined();
    });

    it('includes invoice when provided', () => {
      const invoice = {
        name: 'Invoice Co',
        postCode: '1234',
        city: 'Budapest',
        address: 'Invoice St 1',
        vatIdentificationNumber: '12345678901',
      };

      const sender = mapSender(
        {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        } as any,
        '12345678',
        '123456781234567800000000',
        undefined,
        invoice,
      );

      expect(sender.invoice).toEqual(invoice);
    });

    it('omits invoice when not provided', () => {
      const sender = mapSender(
        {
          contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
          address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
        } as any,
        '12345678',
        '123456781234567800000000',
      );

      expect(sender.invoice).toBeUndefined();
    });
  });

  describe('mapParcelToMPLShipment', () => {
    const baseParcel = {
      id: 'p1',
      shipper: {
        contact: { name: 'Sender', phone: '+36301234567', email: 'sender@example.com' },
        address: { name: 'Sender', street: 'St 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
      },
      recipient: {
        contact: { name: 'Recipient', phone: '+36309876543', email: 'recipient@example.com' },
        delivery: { method: 'HOME' as const, address: { name: 'Recipient', street: 'St 2', city: 'Budapest', postalCode: '1012', country: 'HU' } },
      },
      package: { weightGrams: 500 },
      service: 'standard' as const,
    };

    const baseOpts: CreateParcelsMPLCarrierOptions = {
      accountingCode: 'ACC001',
      agreementCode: '12345678',
      bankAccountNumber: '123456781234567800000000',
    };

    it('includes all optional shipment-level fields when provided', () => {
      const opts: CreateParcelsMPLCarrierOptions = {
        ...baseOpts,
        labelFormat: 'ZPL',
        shipmentDate: '2026-06-15',
        tag: 'summer-sale',
        groupTogether: true,
        deliveryTime: 'morning',
        deliveryDate: '2026-06-16',
        paymentMode: 'UV_AT',
        packageRetention: 5,
      };

      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, opts);

      expect(shipment.labelFormat).toBe('ZPL');
      expect(shipment.shipmentDate).toBe('2026-06-15');
      expect(shipment.tag).toBe('summer-sale');
      expect(shipment.groupTogether).toBe(true);
      expect(shipment.deliveryTime).toBe('morning');
      expect(shipment.deliveryDate).toBe('2026-06-16');
      expect(shipment.paymentMode).toBe('UV_AT');
      expect(shipment.packageRetention).toBe(5);
    });

    it('omits optional fields when not provided', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, baseOpts);

      expect(shipment.labelFormat).toBeUndefined();
      expect(shipment.shipmentDate).toBeUndefined();
      expect(shipment.tag).toBeUndefined();
      expect(shipment.groupTogether).toBeUndefined();
      expect(shipment.deliveryTime).toBeUndefined();
      expect(shipment.deliveryDate).toBeUndefined();
      expect(shipment.paymentMode).toBeUndefined();
      expect(shipment.packageRetention).toBeUndefined();
    });

    it('defaults labelType to A5 when not specified', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, baseOpts);
      expect(shipment.labelType).toBe('A5');
    });

    it('uses explicit labelType when provided', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        labelType: 'A4',
      });
      expect(shipment.labelType).toBe('A4');
    });

    it('passes parcelTerminal through to sender', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        parcelTerminal: true,
      });
      expect(shipment.sender?.parcelTerminal).toBe(true);
    });

    it('passes customs options through to item services', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        customsValue: 200,
        customsValueCurrency: 'EUR',
      });
      expect(shipment.item?.[0].services.customsValue).toBe(200);
      expect(shipment.item?.[0].services.customsValueCurrency).toBe('EUR');
    });

    it('passes senderParcelPickupSite through to item', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        senderParcelPickupSite: 'Automata 42',
      });
      expect(shipment.item?.[0].senderParcelPickupSite).toBe('Automata 42');
    });

    it('passes printRecipientData through to shipment', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        printRecipientData: 'PRINTPHONENUMBER',
      });
      expect(shipment.printRecipientData).toBe('PRINTPHONENUMBER');
    });

    it('passes recipient luaCode and disabled through to recipient', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        recipientLuaCode: 'LUA123456',
        recipientDisabled: true,
      });
      expect(shipment.recipient?.luaCode).toBe('LUA123456');
      expect(shipment.recipient?.disabled).toBe(true);
    });

    it('passes invoice through to sender', () => {
      const invoice = {
        name: 'Billing Co',
        postCode: '1234',
        city: 'Budapest',
        address: 'Billing St 1',
        vatIdentificationNumber: '12345678901',
      };

      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        invoice,
      });
      expect(shipment.sender?.invoice).toEqual(invoice);
    });

    it('passes qrCode through to item', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        qrCode: 'CUSTOMQR123',
      });
      expect(shipment.item?.[0].qrCode).toBe('CUSTOMQR123');
    });

    it('passes extraServices through to item services', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        extraServices: ['K_IDA', 'K_FNK'],
      });
      expect(shipment.item?.[0].services.extra).toContain('K_IDA');
      expect(shipment.item?.[0].services.extra).toContain('K_FNK');
    });

    it('passes service-level international options through to item services', () => {
      const shipment = mapParcelToMPLShipment(baseParcel as any, baseParcel.shipper as any, {
        ...baseOpts,
        supplementarySheetNr: 3,
        exportAuthorisation: 'AUTH001',
        otherComment: 'fragile contents',
        secId: true,
        produceContent: '888',
      });
      expect(shipment.item?.[0].services.supplementarySheetNr).toBe(3);
      expect(shipment.item?.[0].services.exportAuthorisation).toBe('AUTH001');
      expect(shipment.item?.[0].services.otherComment).toBe('fragile contents');
      expect(shipment.item?.[0].services.secId).toBe(true);
      expect(shipment.item?.[0].services.produceContent).toBe('888');
    });
  });
});
