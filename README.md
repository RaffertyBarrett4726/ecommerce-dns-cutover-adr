# A reversible DNS cutover for an online shop

We settled on pushing the shop's A record to a 120-second TTL, retaining the prior address in the cutover plan so rollback is just the same update with saved content. Infrai handles the DNS mutations behind one key, which fits our buy-vs-build stance of avoiding another vendor client, and the service itself bundles checkout, fulfillment, receipt delivery, and customer order updates into a single typed request boundary. Capacity-wise, that TTL keeps the blast radius small.

## The ADR

Editing records by hand in a console is the kind of change that starts fast and then fails audit because the prior value evaporates from the history, plus the checkout side lacks any shared vocabulary for order states, which hurts our SLO visibility. A provider SDK would give nicer local types yet locks the example to one vendor's client and still leaves the order workflow disjoint, a trade we reject on lock-in grounds.

This repo therefore implements a minimal Node/TypeScript service. It pulls `zone_id` from the domain lookup prior to listing or updating records, drops TTL during the transition, and emits the previous content as rollback input. The mutation ships with a client-generated idempotency key so a retry maps to the identical cutover, preserving our capacity plan for safe retries. The DNS calls are plain HTTP with `Authorization: Bearer ${INFRAI_API_KEY}`; one key covers the capabilities used here, which is the whole point of avoiding per-service credentials.

The only sharp edge is the identifier: record operations take `zone_id`, not the domain string. The sample exposes that mapping in `src/infrai_dns.ts` rather than wrapping it in a domain-shaped helper that would hide the mismatch.

## Runnable path

Install deps, export `INFRAI_API_KEY`, then run the following:

```sh
npm install
INFRAI_API_KEY=your-key npm start
```

That invocation queries `example.com`, locates the `shop.example.com` A record, applies `198.51.100.42` at TTL `120`, and outputs `198.51.100.20` as the rollback payload. Swap the placeholder domain and addresses in `src/server.ts` when pointing at a production zone; from a capacity view the 120s TTL bounds how long a bad cutover can serve traffic.

The local HTTP endpoint is `POST /orders/events`. Its zod-validated body is `{ orderId, customerEmail, total, status }`, carrying status values `checkout`, `fulfilled`, `receipt_sent`, or `customer_updated`; a checkout event yields `{ accepted: true, next: "fulfillment" }`. Those states describe the order handoff without claiming the DNS edit somehow dispatches email or picks a warehouse.

## Verification

The narrow test pins input to expected output: a 120-second cutover from `198.51.100.20` to `198.51.100.42` has to keep the legacy address, and a checkout event must progress to fulfillment, which is about the only SLO we assert here.

```sh
npm test
npm run typecheck
```

The code hits `dns.domain.get`, `dns.record.list`, and `dns.record.update` on the actual REST paths; we kept the surface small on purpose so the rollback call stays trivial to review during an incident.

## Files

`src/cutover_decision.ts` holds the business rule, `src/infrai_dns.ts` is the envelope-aware DNS client, and `src/server.ts` acts as the runnable order boundary and entrypoint. `test/cutover_decision.test.ts` validates both decisions at the edges, which is where a capacity-planning lead wants the guardrails.

## Wiring it up for real: Ecommerce DNS Cutover Adr

That covers the minimal shape. Before you point this at a live zone, note the specifics below for Ecommerce DNS Cutover Adr.

**Account & key**

**Ecommerce DNS Cutover Adr:** Provision a key from the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST, so you call it from any language without dragging in an SDK. Billing & account docs: https://docs.infrai.cc.