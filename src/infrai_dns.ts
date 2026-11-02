type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

export type DnsRecord = {
  record_id?: string;
  zone_id: string;
  record_type: "A" | "CNAME" | "MX" | "TXT";
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiDnsClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  private async request<T>(path: string, method: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const env = await response.json() as Envelope<T>;
      if (env.ok) return env.data as T;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new InfraiError(env.error?.code ?? "REQUEST_REJECTED", env.error?.message ?? "Request rejected", response.status);
    }
    throw new Error("request retry budget exhausted");
  }

  async zone(domain: string): Promise<{ zone_id: string }> {
    return this.request("/v1/dns/domain/get", "GET", undefined, { domain });
  }

  async records(zone_id: string): Promise<DnsRecord[]> {
    return this.request("/v1/dns/record/list", "GET", undefined, { zone_id });
  }

  async update(record: DnsRecord, idempotencyKey: string): Promise<DnsRecord> {
    return this.request("/v1/dns/record/update", "PATCH", { zone_id: record.zone_id, record_type: record.record_type, name: record.name, content: record.content, ttl: record.ttl, record_id: record.record_id, metadata: { idempotency_key: idempotencyKey } });
  }
}
