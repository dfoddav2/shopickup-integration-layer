# MPL PartnerExtra — Detailed Pickup Points Feed

PartnerExtra is an MPL public XML feed that exposes the full set of post offices,
posta partners, and pickup points with richer metadata than the authenticated
`/deliveryplace` JSON endpoint.

## Links

- API description: <https://www.posta.hu/partnerextra>
- Production endpoint: <https://httpmegosztas.posta.hu/PartnerExtra/Out/PostInfo.xml>

## Characteristics

- **Unauthenticated** — plain `GET`, no credentials, no headers.
- **No test/sandbox** — only the single production endpoint exists.
- **No filtering** — the feed returns every point in one response.
- **XML response** — coordinate values use a **comma as decimal separator**
  (Hungarian locale), e.g. `48,028436`.

## XML Schema

```xml
<postInfo timestamp="...">
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
    </workingHours>
    <description>...</description>
    <email>uzleti.ugyfelszolgalat@posta.hu</email>
    <ServicePointType>PM</ServicePointType>
  </post>
  <!-- ... more <post> entries ... -->
</postInfo>
```

### Field reference

| XML element | Attribute | Description |
|---|---|---|
| `postInfo` | `timestamp` | Feed generation timestamp |
| `post` | `isPostPoint` | `"1"` when the point is a posta partner |
| `post` | `zipCode` | Postal code of the point |
| `ID` | | Stable point identifier |
| `name` | | Display name |
| `city` | | City name |
| `street/name` | | Street name |
| `street/type` | | Street type (e.g. `utca`) |
| `street/houseNumber` | | House number |
| `gpsData/EOVx`, `gpsData/EOVy` | | EOV (Hungarian grid) coordinates |
| `gpsData/WGSLat`, `gpsData/WGSLon` | | WGS84 latitude / longitude (**comma decimal separator**) |
| `phoneArea` | | Contact phone |
| `workingHours` | `culture` | Locale of the day names (e.g. `HU`) |
| `workingHours/days` | | One entry per open day; `<day>` + `<From1>`/`<To1>` (optionally `<From2>`/`<To2>`) |
| `description` | | Free-form description (`N/A` when empty) |
| `email` | | Contact email |
| `ServicePointType` | | `PM` = post office, `PP` = posta point, `CS` = parcel locker, etc. |

### Notes

- Repeated elements (`<post>`, `<days>`) may appear as a single object when only
  one exists; treat both object and array forms as equivalent.
- `From1`/`To1` describe the first open interval of the day; a second interval
  may be present as `From2`/`To2`.
