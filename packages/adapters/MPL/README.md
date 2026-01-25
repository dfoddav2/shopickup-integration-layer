# @shopickup/adapters-mpl

Shopickup adapter for **MPL** - a major Hungarian logistics carrier providing parcel delivery and pickup services.

## Features

## State of Implementation

The following table shows what API endpoints and features of the Foxpost API have or have not been implemented in this adapter yet:

| Endpoint / Feature                  | Description                          | Implemented  | Details                                                           |
|-------------------------------------|--------------------------------------|--------------|-------------------------------------------------------------------|
| POST/addresses/cityToZipCode        | Get Zip Codes by City                | 🗓️ No        | Not implemented yet, planned                                      |
| POST/addresses/zipCodeToCity        | Get City by Zip Code                 | 🗓️ No        | Not implemented yet, planned                                      |
| POST/deliveryplace                  | Get Pickup Locations                 | 🗓️ No        | Not implemented yet, planned                                      |
| POST/reports                        | Report on Disp. Packages             | ❌ No        | Not planned; nieche feature                                       |
| POST/shipments                      | Submission of Parcel Data            | 🗓️ No        | Not implemented yet, planned                                      |
| GET/shipments                       | Get Details of Shipments             | 🗓️ No        | Not implemented yet, planned                                      |
| POST/shipments{trackingNumber}/item | Add Package to Separate Consignment  | ❌ No        | Not planned; custom barcodes are niche                            |
| GET/shipments/label                 | Query Address Label of Parcel(s)     | 🗓️ No        | Not implemented yet, planned                                      |
| GET/shipments/{trackingNumber}      | Query Item through Tracking Number   | 🗓️ No        | Not implemented yet, planned                                      |
| DELETE/shipments/{trackingNumber}   | Delete Item through Tracking Number  | 🗓️ No        | Not implemented yet, planned                                      |
| POST/shipments/close                | Request Closing List + Delivery Note | 🗓️ No        | Not implemented yet, planned                                      |
| PULL 1 Tracking /registered         | Get Detailed Tracking Information    | 🗓️ No        | Not implemented yet, planned                                      |
| PULL 1 Tracking /guest              | Get Tracking Information             | 🗓️ No        | Not implemented yet, planned                                      |
| POST 500 Trackings /tracking        | Bulk Detailed Tracking Information   | 🗓️ No        | Not implemented yet, planned                                      |
| GET 500 /tracking/{trackingGUID}    | Bulk Tracking Information            | 🗓️ No        | Not implemented yet, planned                                      |
