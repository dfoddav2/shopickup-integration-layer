import { describe, it, expect, beforeEach } from 'vitest';
import { fetchDetailedPickupPoints } from '../../capabilities/pickup-points-detailed.js';
import type { AdapterContext, HttpResponse } from '@shopickup/core';
import { CarrierError } from '@shopickup/core';

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

/**
 * Mock HTTP client that responds to the PartnerExtra endpoint
 */
class MockHttpClient {
  private response: HttpResponse<any> | null = null;

  setResponse(response: HttpResponse<any>): void {
    this.response = response;
  }

  async get<T>(url: string, options?: any): Promise<HttpResponse<T>> {
    if (!this.response) {
      throw new Error(`No mock response configured for ${url}`);
    }
    return this.response as HttpResponse<T>;
  }
}

/**
 * Mock logger for capturing logs
 */
class MockLogger {
  logs: any[] = [];

  debug(msg: string, data?: any): void {
    this.logs.push({ level: 'debug', msg, data });
  }

  info(msg: string, data?: any): void {
    this.logs.push({ level: 'info', msg, data });
  }

  warn(msg: string, data?: any): void {
    this.logs.push({ level: 'warn', msg, data });
  }

  error(msg: string, data?: any): void {
    this.logs.push({ level: 'error', msg, data });
  }

  getLogs(level?: string): any[] {
    return level ? this.logs.filter(l => l.level === level) : this.logs;
  }
}

describe('MPL Detailed Pickup Points (PartnerExtra)', () => {
  let httpClient: MockHttpClient;
  let logger: MockLogger;

  beforeEach(() => {
    httpClient = new MockHttpClient();
    logger = new MockLogger();
  });

  it('fetches and maps the full PartnerExtra XML feed into PickupPoints', async () => {
    httpClient.setResponse({
      status: 200,
      headers: {},
      body: SAMPLE_XML,
    });

    const ctx: AdapterContext = {
      http: httpClient as any,
      logger,
    };

    const result = await fetchDetailedPickupPoints({ options: {} }, ctx);

    expect(result.points).toHaveLength(2);

    const first = result.points[0];
    expect(first.id).toBe('107264');
    expect(first.name).toBe('Botpalád postapartner');
    expect(first.postalCode).toBe('4955');
    expect(first.city).toBe('Botpalád');
    expect(first.country).toBe('hu');
    expect(first.street).toBe('Fő utca 124');
    expect(first.address).toContain('Fő utca 124');
    expect(first.latitude).toBe(48.028436);
    expect(first.longitude).toBe(22.807174);
    expect(first.contact?.phone).toBe('1-767-8272');
    expect(first.contact?.email).toBe('uzleti.ugyfelszolgalat@posta.hu');

    // metadata preservation
    expect(first.metadata?.servicePointType).toBe('PM');
    expect(first.metadata?.isPostPoint).toBe(true);
    expect(first.metadata?.zipCode).toBe('4955');
    expect(first.metadata?.workingHours).toHaveLength(2);
    expect(first.metadata?.workingHours[0]).toEqual({
      day: 'Hétfő',
      From1: '08:00',
      To1: '10:00',
    });

    // canonical opening hours (English day names, same shape as GLS)
    expect(first.openingHours).toEqual({
      Monday: '08:00 - 10:00',
      Tuesday: '08:00 - 10:00',
    });

    // raw response preserved
    expect(first.raw?.ID).toBe('107264');

    // summary
    expect(result.summary?.totalCount).toBe(2);
    expect(result.rawCarrierResponse?.post).toBeDefined();
  });

  it('treats non-post-point entries correctly', async () => {
    httpClient.setResponse({
      status: 200,
      headers: {},
      body: SAMPLE_XML,
    });

    const ctx: AdapterContext = {
      http: httpClient as any,
      logger,
    };

    const result = await fetchDetailedPickupPoints({}, ctx);
    const second = result.points[1];

    expect(second.id).toBe('111');
    expect(second.metadata?.isPostPoint).toBe(false);
    expect(second.latitude).toBeUndefined();
    expect(second.workingHours).toBeUndefined();
  });

  it('returns an empty points array when the feed has no posts', async () => {
    httpClient.setResponse({
      status: 200,
      headers: {},
      body: '<postInfo timestamp="2024-01-01"></postInfo>',
    });

    const ctx: AdapterContext = {
      http: httpClient as any,
      logger,
    };

    const result = await fetchDetailedPickupPoints({}, ctx);

    expect(result.points).toEqual([]);
    expect(result.summary?.totalCount).toBe(0);
  });

  it('throws CarrierError with Permanent category for malformed XML', async () => {
    httpClient.setResponse({
      status: 200,
      headers: {},
      body: '<postInfo><post></postInfo>',
    });

    const ctx: AdapterContext = {
      http: httpClient as any,
      logger,
    };

    try {
      await fetchDetailedPickupPoints({}, ctx);
      expect.fail('Should have thrown CarrierError');
    } catch (err) {
      expect(err).toBeInstanceOf(CarrierError);
      const error = err as CarrierError;
      expect(error.category).toBe('Permanent');
      expect(error.message).toContain('Failed to parse MPL PartnerExtra XML');
    }
  });

  it('throws CarrierError for non-200 responses', async () => {
    httpClient.setResponse({
      status: 503,
      headers: {},
      body: 'Service Unavailable',
    });

    const ctx: AdapterContext = {
      http: httpClient as any,
      logger,
    };

    try {
      await fetchDetailedPickupPoints({}, ctx);
      expect.fail('Should have thrown CarrierError');
    } catch (err) {
      expect(err).toBeInstanceOf(CarrierError);
      const error = err as CarrierError;
      expect(error.category).toBe('Transient');
      expect(error.message).toContain('returned status 503');
    }
  });

  it('throws CarrierError with Permanent category when HTTP client is missing', async () => {
    const ctx: AdapterContext = {
      logger,
    };

    try {
      await fetchDetailedPickupPoints({}, ctx);
      expect.fail('Should have thrown CarrierError');
    } catch (err) {
      expect(err).toBeInstanceOf(CarrierError);
      const error = err as CarrierError;
      expect(error.category).toBe('Permanent');
      expect(error.message).toContain('HTTP client not provided');
    }
  });

  it('converts unknown errors to CarrierError with Transient category', async () => {
    const brokenHttpClient = {
      get: async () => {
        throw new Error('Network timeout');
      },
    };

    const ctx: AdapterContext = {
      http: brokenHttpClient as any,
      logger,
    };

    try {
      await fetchDetailedPickupPoints({}, ctx);
      expect.fail('Should have thrown CarrierError');
    } catch (err) {
      expect(err).toBeInstanceOf(CarrierError);
      const error = err as CarrierError;
      expect(error.category).toBe('Transient');
      expect(error.message).toContain('Failed to fetch MPL detailed pickup points');
    }
  });
});
