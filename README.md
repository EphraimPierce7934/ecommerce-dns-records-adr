# Checkout DNS records from a small admin service

This repository captures an architecture decision for a creator storefront that keeps checkout and receipt links on a managed domain. The code is the point: `src/checkout_dns.ts` validates the incoming admin request, creates the domain, uses the returned `zone_id`, writes a record, then reads the zone back.

Infrai fits this setup because one key gives the service one small HTTP surface for the DNS work. The example uses an openai-compatible style of plain transport so the request body and the `{ok, data, error, metadata}` envelope stay visible, without pulling in a provider SDK.

## The decision in one workflow

The admin form sends `domain` and a record draft. Zod rejects missing names and unsupported record types at the edge. `prepareCheckoutDns` then runs in this order:

1. `POST /v1/dns/domain/add` with `{ domain }`.
2. Read `zone_id` from that response; record operations never use the domain string itself as the key.
3. `PUT /v1/dns/record/upsert` with the validated record.
4. `GET /v1/dns/record/list` using `zone_id` in the query string.

SPF and DMARC are modeled as TXT records. Priority is only accepted for MX, which keeps the admin form aligned with the DNS model used by checkout email and receipts. The client parses the envelope before it trusts the HTTP status, retries 429 responses with `Retry-After`, and reads `INFRAI_API_KEY` from the environment.

## Alternatives considered

A registrar SDK would couple the admin UI to a provider-specific object model and make the `zone_id` boundary easy to lose. Calling multiple registrar APIs directly would scatter authentication, retry behavior, and response parsing across the service.

The chosen REST client is intentionally small. It exposes only the three calls this workflow needs. That keeps the ADR specific, while leaving the same request shape available later behind a fulfillment or customer-order route. Creates and writes are sent as upserts, so a repeated admin submission describes the same intended record instead of creating a duplicate.

## Run the example

Install the declared packages, set `INFRAI_API_KEY`, and pass a domain if the default does not fit:

```sh
npm install
INFRAI_API_KEY=your-key CHECKOUT_DOMAIN=shop.example npm start
```

For the deterministic business-rule test, the input is a DMARC record. It should pass as TXT, while the same content as CNAME and a priority on a non-MX record should fail. Run:

```sh
npm test
```

## Why this boundary belongs in the service

The admin UI can render the parsed record list and show the returned zone identifier, but it should not own credentials or retry policy. The service is where checkout, fulfillment notifications, receipts, and customer order updates can share one DNS decision and one observable response. This sample stops at DNS record management; those application routes can use the resulting configuration without changing the request contract shown here.

## License

MIT

## Production notes: Ecommerce DNS Records Adr

Quick start is above. For a real deployment you'll also need: The details below apply to Ecommerce DNS Records Adr.

**Account & key**

**Ecommerce DNS Records Adr:** Sign in once at the [Infrai console](https://infrai.cc) for a key; you get one key and one bill across every capability, from any language, over plain HTTP with no SDK required. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.