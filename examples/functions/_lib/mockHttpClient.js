function now() {
  return new Date().toISOString();
}

function makeResponse(status = 200, body = {}) {
  return Promise.resolve({ status, statusCode: status, headers: {}, body });
}

function logRequest(method, url, data) {
  console.info(`[mock-http][${now()}] ${method.toUpperCase()} ${url}`, data ? { data } : undefined);
}

function toBase64PdfStub() {
  return Buffer.from('%PDF-1.4\n% mock pdf\n').toString('base64');
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapParcelListToInfos(parcelList = []) {
  return parcelList.map((parcel, idx) => {
    const fallbackId = 100000 + idx;
    const parsedId = asNumber(parcel?.ClientReference ?? parcel?.clientReference, fallbackId);
    return {
      ParcelId: parsedId,
      ClientReference: String(parcel?.ClientReference ?? parcel?.clientReference ?? parsedId),
      ParcelNumber: parsedId,
    };
  });
}

function mapParcelIdsToInfos(parcelIdList = []) {
  return parcelIdList.map((id, idx) => {
    const numericId = asNumber(id, 200000 + idx);
    return {
      ParcelId: numericId,
      ClientReference: String(numericId),
      ParcelNumber: numericId,
    };
  });
}

function handleGlsPost(url, data) {
  if (url.includes('/json/PrepareLabels')) {
    const infos = mapParcelListToInfos(data?.ParcelList || []);
    return makeResponse(200, {
      ParcelInfoList: infos.map((info) => ({ ParcelId: info.ParcelId, ClientReference: info.ClientReference })),
      PrepareLabelsError: [],
    });
  }

  if (url.includes('/json/GetPrintedLabels')) {
    const infos = mapParcelIdsToInfos(data?.ParcelIdList || []);
    return makeResponse(200, {
      Labels: toBase64PdfStub(),
      PrintDataInfoList: infos,
      GetPrintedLabelsErrorList: [],
    });
  }

  if (url.includes('/json/PrintLabels')) {
    const infos = mapParcelListToInfos(data?.ParcelList || []);
    return makeResponse(200, {
      Labels: toBase64PdfStub(),
      PrintLabelsInfoList: infos,
      PrintLabelsErrorList: [],
    });
  }

  if (url.includes('/json/GetParcelStatuses')) {
    const parcelNumber = asNumber(data?.ParcelNumber, 11273216);
    return makeResponse(200, {
      ParcelNumber: parcelNumber,
      ClientReference: String(parcelNumber),
      ParcelStatusList: [
        {
          DepotCity: 'Budapest',
          DepotNumber: 'HU01',
          StatusCode: '1',
          StatusDate: '2026-04-01T08:00:00Z',
          StatusDescription: 'Parcel data entered',
        },
        {
          DepotCity: 'Budapest',
          DepotNumber: 'HU01',
          StatusCode: '5',
          StatusDate: '2026-04-02T12:00:00Z',
          StatusDescription: 'Delivered',
        },
      ],
      GetParcelStatusErrors: [],
    });
  }

  if (url.includes('/deliveryplace')) {
    return makeResponse(200, [
      {
        deliveryplacesQueryResult: {
          deliveryplace: 'Mock MPL PostaPont',
          postCode: '1111',
          city: 'Budapest',
          address: 'Mock street 1',
          geocodeLat: 47.4979,
          geocodeLong: 19.0402,
          id: 'mpl-mock-1',
          errors: null,
        },
        servicePointType: ['PM', 'PP'],
      },
    ]);
  }

  return null;
}

function handleGlsGet(url) {
  if (url.includes('map.gls-hungary.com/data/deliveryPoints/')) {
    return makeResponse(200, {
      items: [
        {
          id: 'HU1234',
          goldId: 1234,
          name: 'Mock GLS Point',
          description: 'Mock pickup point',
          contact: {
            countryCode: 'HU',
            postalCode: '1138',
            city: 'Budapest',
            address: 'Vaci ut 10',
            web: 'mock@example.com',
            phone: '+3612345678',
          },
          location: [47.513, 19.057],
          hours: [
            [1, '08:00', '18:00'],
            [2, '08:00', '18:00'],
            [3, '08:00', '18:00'],
            [4, '08:00', '18:00'],
            [5, '08:00', '18:00'],
          ],
          features: ['pickup', 'delivery', 'acceptsCash', 'acceptsCard'],
          type: 'parcel-shop',
          externalId: 'EXT-HU1234',
          hasWheelchairAccess: true,
        },
      ],
    });
  }

  return null;
}

export function createMockHttpClient() {
  return {
    async get(url, _config) {
      logRequest('get', url);
      const glsResponse = handleGlsGet(url);
      if (glsResponse) return glsResponse;
      return makeResponse(200, { url, method: 'GET', ok: true });
    },
    async post(url, data, _config) {
      logRequest('post', url, data);
      const glsResponse = handleGlsPost(url, data);
      if (glsResponse) return glsResponse;
      return makeResponse(201, { url, method: 'POST', ok: true, data });
    },
    async put(url, data, _config) {
      logRequest('put', url, data);
      return makeResponse(200, { url, method: 'PUT', ok: true, data });
    },
    async patch(url, data, _config) {
      logRequest('patch', url, data);
      return makeResponse(200, { url, method: 'PATCH', ok: true, data });
    },
    async delete(url, _config) {
      logRequest('delete', url);
      return makeResponse(204, { url, method: 'DELETE', ok: true });
    },
  };
}
