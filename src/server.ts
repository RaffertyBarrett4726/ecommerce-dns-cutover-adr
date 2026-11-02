import { createServer } from "node:http";
import { z } from "zod";
import { InfraiDnsClient } from "./infrai_dns.ts";
import { planCutover } from "./cutover_decision.ts";

const orderEvent = z.object({
  orderId: z.string().min(1),
  customerEmail: z.string().email(),
  total: z.number().nonnegative(),
  status: z.enum(["checkout", "fulfilled", "receipt_sent", "customer_updated"]),
});

export function createOrderResponse(body: unknown): { accepted: boolean; orderId: string; next: string } {
  const event = orderEvent.parse(body);
  const next = event.status === "checkout" ? "fulfillment" : event.status === "fulfilled" ? "receipt" : "customer_update";
  return { accepted: true, orderId: event.orderId, next };
}

async function main(): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const client = new InfraiDnsClient(key);
  const capability = "dns.record.update";
  const plan = planCutover({ hostname: "shop.example.com", oldContent: "198.51.100.20", newContent: "198.51.100.42", ttl: 120 });
  const zone = await client.zone("example.com");
  const current = (await client.records(zone.zone_id)).find((record) => record.name === plan.hostname && record.record_type === "A");
  if (!current) throw new Error("target A record was not found");
  await client.update({ ...current, content: plan.forward, ttl: plan.ttl }, `cutover-${plan.hostname}-${plan.ttl}`);
  console.log(JSON.stringify({ capability, zone_id: zone.zone_id, hostname: plan.hostname, ttl: plan.ttl, rollback_content: plan.rollback, order_states: ["checkout", "fulfilled", "receipt_sent", "customer_updated"] }, null, 2));
}

function startServer(): void {
  createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/orders/events") {
    response.writeHead(404).end();
    return;
  }
  let raw = "";
  request.on("data", (chunk) => { raw += chunk; });
  request.on("end", () => {
    try {
      const result = createOrderResponse(JSON.parse(raw));
      response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify(result));
    } catch {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ accepted: false }));
    }
  });
  }).listen(Number(process.env.PORT ?? 3000));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
  void main();
}
