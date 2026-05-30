/**
 * Live E2E test for Foxpost delete-parcel capability
 * Creates a parcel in the sandbox, then deletes it.
 */

import { describe, expect, it } from 'vitest';
import type { Parcel } from '@shopickup/core';
import { getFoxpostLiveConfig } from './live-env.js';

function createLiveParcel(): Parcel {
  return {
    id: `live-del-${Date.now()}`,
    shipper: {
      contact: {
        name: 'Shopickup Test Sender',
        phone: '+36301234567',
        email: 'sender@example.com',
      },
      address: {
        name: 'Shopickup Test Sender',
        street: '1 Test Street',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
        phone: '+36301234567',
        email: 'sender@example.com',
      },
    },
    recipient: {
      contact: {
        name: 'Foxpost Live Recipient',
        phone: '+36309876543',
        email: 'recipient@example.com',
      },
      delivery: {
        method: 'HOME',
        address: {
          name: 'Foxpost Live Recipient',
          street: '2 Test Avenue',
          city: 'Budapest',
          postalCode: '1012',
          country: 'HU',
          phone: '+36309876543',
          email: 'recipient@example.com',
        },
      },
    },
    package: {
      weightGrams: 1000,
    },
    service: 'standard',
    references: {
      customerReference: `FOXPOST-DEL-${Date.now()}`,
    },
  };
}

const live = getFoxpostLiveConfig();
if (!live.enabled) {
  describe.skip('Foxpost live delete-parcel flow', () => {
    it(live.reason, () => { });
  });
} else {
  const { adapter, context, credentials, useTestApi } = live;

  describe('Foxpost live delete-parcel flow', () => {
    it('creates a parcel then deletes it', async () => {
      const parcel = createLiveParcel();

      console.log('Foxpost live delete-parcel test config', {
        baseUrl: live.baseUrl,
        useTestApi: live.useTestApi,
        parcelId: parcel.id,
      });

      // Create the parcel
      const createdParcel = await adapter.createParcel!(
        {
          parcel,
          credentials,
          options: { useTestApi },
        },
        context,
      );

      console.log('Foxpost live createParcel result', createdParcel);
      expect(createdParcel.carrierId).toBeTruthy();

      // Delete the parcel
      const deleteResult = await adapter.deleteParcel!(
        {
          parcelCarrierId: createdParcel.carrierId!,
          credentials,
          options: { useTestApi },
        },
        context,
      );

      console.log('Foxpost live deleteParcel result', deleteResult);
      expect(deleteResult.status).toBe('deleted');
      expect(deleteResult.carrierId).toBe(createdParcel.carrierId);
    });
  });
}
