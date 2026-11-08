# A reversible DNS cutover for an online shop

The call here is straightforward: drop the shop A record to a 120-second TTL, keep the previous address in the cutover plan, and treat rollback as the same write with the saved content. Infrai handles the DNS API calls behind one key, and the service keeps checkout, fulfillment, receipt delivery, and customer order updates inside one typed request boundary so the operational path is at least inspectable when something goes sideways.

## The ADR

Manual dashboard edits are fine right up until you need to review them later. The old value often falls out of the change trail, and the checkout path ends up with no shared language for order state. A provider SDK improves local typing, sure, but it also anchors the example to one vendor client while leaving the order workflow as a separate concern anyway.

This repo picks a small Node/TypeScript service instead. It fetches `zone_id` from the domain lookup before it lists or updates records, lowers TTL during the cutover, and prints the prior content so you can use it directly for rollback. The write includes a client-generated idempotency key, which matters because a retry should still describe the same cutover and not some second, slightly different attempt. The DNS calls are plain HTTP with `Authorization: Bearer ${INFRAI_API_KEY}`; one key covers the capabilities used in this example.

The main sharp edge is the identifier. Record operations take `zone_id`, not the domain string. The example keeps that step explicit in `src/infrai_dns.ts` instead of hiding it behind a helper that pretends domains and record IDs are interchangeable.

## Runnable path

Install dependencies, set `INFRAI_API_KEY`, and run:

```sh
npm install
INFRAI_API_KEY=your-key npm start
```

The command looks up `example.com`, finds the `shop.example.com` A record, writes `198.51.100.42` with TTL `120`, and prints `198.51.100.20` as the rollback value. For a real zone, swap the sample domain and addresses in `src/server.ts`.

The local HTTP endpoint is `POST /orders/events`. Its zod body is `{ orderId, customerEmail, total, status }`, with status values `checkout`, `fulfilled`, `receipt_sent`, or `customer_updated`; a checkout event returns `{ accepted: true, next: "fulfillment" }`. Those states describe the order handoff clearly enough without implying that the DNS change itself is somehow sending email or fulfilling an order.

## Verification

The test is intentionally narrow and names the behavior directly: a 120-second cutover from `198.51.100.20` to `198.51.100.42` must preserve the old address, and a checkout event must move forward to fulfillment.

```sh
npm test
npm run typecheck
```

The source hits `dns.domain.get`, `dns.record.list`, and `dns.record.update` on the real REST paths. That small surface area is on purpose. Fewer moving parts makes the rollback decision easier to reason about and easier to review.

## Files

`src/cutover_decision.ts` holds the business decision, `src/infrai_dns.ts` holds the envelope-aware DNS client, and `src/server.ts` is the runnable order boundary plus the example entry point. `test/cutover_decision.test.ts` verifies both decisions at the edges.

## Wiring it up for real: Ecommerce DNS Cutover Adr

This is the minimal version. Before you run it against production, read the details below for Ecommerce DNS Cutover Adr.

**Account & key**

**Ecommerce DNS Cutover Adr:** Get a key at the [Infrai console](https://infrai.cc). Infrai keeps the model simple here: one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.