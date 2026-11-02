import test from "node:test";
import assert from "node:assert/strict";
import { planCutover } from "../src/cutover_decision.ts";
import { createOrderResponse } from "../src/server.ts";

test("short TTL plan keeps the old address as an explicit rollback", () => {
  assert.deepEqual(planCutover({ hostname: "shop.example.com", oldContent: "198.51.100.20", newContent: "198.51.100.42", ttl: 120 }), { hostname: "shop.example.com", ttl: 120, forward: "198.51.100.42", rollback: "198.51.100.20" });
});

test("order boundary advances checkout into fulfillment", () => {
  assert.deepEqual(createOrderResponse({ orderId: "ord-7", customerEmail: "buyer@example.com", total: 42, status: "checkout" }), { accepted: true, orderId: "ord-7", next: "fulfillment" });
});
