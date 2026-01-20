# FoxPost Hungary  API and Integration Guide

This document provides an overview of the FoxPost Hungary carrier API and instructions on how to integrate it into the Shopickup system.

## General Information

FoxPost published its new API called FoxWeb API in 2021, which is a RESTful API that allows businesses to create shipments, print labels, and track packages.

Docs: [FoxWeb API Documentation](https://foxpost.hu/uzleti-partnereknek/integracios-segedlet/webapi-integracio)

### Base URLs

- Production: `https://webapi.foxpost.hu/api`
- Sandbox: `https://webapi-test.foxpost.hu/api`

### Swagger UI

- Production API Endpoint: `https://webapi.foxpost.hu/swagger-ui/index.html`
- Sandbox API Endpoint: `https://webapi-test.foxpost.hu/swagger-ui/index.html`

## Authentication and Required Headers

Required Headers:

| Header Name         | Description                       |
|---------------------|-----------------------------------|
| Authorization       | Basic encoded username + password |
| API-Key             | Your FoxPost API key              |
| Content-Type        | application/json (in most cases)  |

##
