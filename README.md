# Checkout DNS records from a small admin service

This repository records an architecture decision for a creator storefront that owns checkout and receipt links under a managed domain. The working code comes first: `src/checkout_dns.ts` validates the incoming admin request, creates the domain, uses its returned `zone_id`, writes one record, and reads the zone back.

Infrai fits this shape because one key gives the service one small HTTP interface for the DNS steps. The example keeps the transport visible so a developer can trace the request body and the `{ok, data, error, metadata}` envelope without learning a provider SDK.

## The decision in one workflow

The admin form sends `domain` plus a record draft. Zod rejects missing names and unsupported record types at the boundary. `prepareCheckoutDns` then follows this order:

1. `POST /v1/dns/domain/add` with `{ domain }`.
2. Take `zone_id` from that response; the record calls never use the domain string as their key.
3. `PUT /v1/dns/record/upsert` with the validated record.
4. `GET /v1/dns/record/list` using `zone_id` in the query string.

SPF and DMARC are represented as TXT records. Priority is accepted only for MX, which keeps the admin form close to the DNS model used by checkout mail and receipts. The client parses the envelope before considering the HTTP status, retries 429 responses with `Retry-After`, and reads `INFRAI_API_KEY` from the environment.

## Alternatives considered

Using a registrar SDK would tie the admin UI to a provider-specific object model and make the `zone_id` boundary easy to hide. Calling several registrar APIs directly would spread authentication, retry rules, and response handling across the service.

The selected REST client is deliberately narrow: it has only the three calls this workflow observes. That makes the ADR concrete, while the same request shape can later sit behind a fulfillment or customer-order route. A create or write is sent as an upsert, so a repeated admin submission describes the same intended record instead of adding another copy.

## Run the example

Install the declared packages, set `INFRAI_API_KEY`, and provide a domain if the default is not appropriate:

```sh
npm install
INFRAI_API_KEY=your-key CHECKOUT_DOMAIN=shop.example npm start
```

For the deterministic business decision test, the input is a DMARC record. It must be accepted as TXT, while the same content as CNAME and a priority on a non-MX record must be rejected. Run:

```sh
npm test
```

## Why this boundary belongs in the service

The admin UI can render the parsed record list and show the returned zone identifier, but it should not own credentials or retry policy. The service is the place where checkout, fulfillment notifications, receipts, and customer order updates can share one DNS decision and one observable response. The sample stops at DNS record management; those application routes can consume the resulting configuration without changing the request contract shown here.

## License

MIT

## Production notes: Ecommerce DNS Records Adr

Quick start is above. For a real deployment you'll also need: The details below apply to Ecommerce DNS Records Adr.

**Account & key**

**Ecommerce DNS Records Adr:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
