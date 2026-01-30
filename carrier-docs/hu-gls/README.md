# MyGLS API - HU

This document provides information about the MyGLS API for Hungary (HU). The MyGLS API allows you to integrate GLS shipping services into your applications, enabling functionalities such as creating shipments, tracking packages, and managing delivery options.

## Pickup Points

Each country has their own public API endpoint for retrieving pickup points, however we have found that most countries can be reached from the Hungary main domain via the following format: `https://map.gls-hungary.com/data/deliveryPoints/<country_code>.json` where `<country_code>` is the two-letter ISO code of the desired country.

Available Pickup Points Endpoints in Table Format:

| Country        | Endpoint URL                                              |
|----------------|-----------------------------------------------------------|
| Austria        | <https://map.gls-hungary.com/data/deliveryPoints/at.json> |
| Belgium        | <https://map.gls-hungary.com/data/deliveryPoints/be.json> |
| Bulgaria       | <https://map.gls-hungary.com/data/deliveryPoints/bg.json> |
| Check Republic | <https://map.gls-hungary.com/data/deliveryPoints/cz.json> |
| Germany        | <https://map.gls-hungary.com/data/deliveryPoints/de.json> |
| Denmark        | <https://map.gls-hungary.com/data/deliveryPoints/dk.json> |
| Spain          | <https://map.gls-hungary.com/data/deliveryPoints/es.json> |
| Finland        | <https://map.gls-hungary.com/data/deliveryPoints/fi.json> |
| France         | <https://map.gls-hungary.com/data/deliveryPoints/fr.json> |
| Greece         | <https://map.gls-hungary.com/data/deliveryPoints/gr.json> |
| Croatia        | <https://map.gls-hungary.com/data/deliveryPoints/hr.json> |
| Hungary        | <https://map.gls-hungary.com/data/deliveryPoints/hu.json> |
| Italy          | <https://map.gls-hungary.com/data/deliveryPoints/it.json> |
| Luxembourg     | <https://map.gls-hungary.com/data/deliveryPoints/lu.json> |
| Netherlands    | <https://map.gls-hungary.com/data/deliveryPoints/nl.json> |
| Poland         | <https://map.gls-hungary.com/data/deliveryPoints/pl.json> |
| Portugal       | <https://map.gls-hungary.com/data/deliveryPoints/pt.json> |
| Romania        | <https://map.gls-hungary.com/data/deliveryPoints/ro.json> |
| Slovenia       | <https://map.gls-hungary.com/data/deliveryPoints/si.json> |
| Slovakia       | <https://map.gls-hungary.com/data/deliveryPoints/sk.json> |
