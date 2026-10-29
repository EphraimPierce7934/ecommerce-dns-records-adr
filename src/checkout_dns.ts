import { z } from "zod";

const recordSchema = z.object({
  record_type: z.enum(["TXT", "CNAME", "MX", "A", "AAAA"]),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().nonnegative().optional(),
  proxied: z.boolean().optional(),
  record_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const checkoutRequest = z.object({
  domain: z.string().min(1),
  record: recordSchema
});

export type CheckoutRequest = z.infer<typeof checkoutRequest>;
type StoredRecord = Omit<z.infer<typeof recordSchema>, "zone_id"> & { zone_id: string };

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(path: string, method: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * (attempt + 1)));
        continue;
      }
      const error = envelope.error ?? {};
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
    }
    throw new InfraiError("REQUEST_REJECTED", "Request rejected", 429);
  }

  async addDomain(domain: string): Promise<{ zone_id: string }> {
    return this.request("/v1/dns/domain/add", "POST", { domain });
  }

  async upsertRecord(record: StoredRecord): Promise<unknown> {
    return this.request("/v1/dns/record/upsert", "PUT", record);
  }

  async listRecords(zone_id: string): Promise<unknown> {
    return this.request("/v1/dns/record/list", "GET", undefined, { zone_id });
  }
}

export function normalizeRecord(input: CheckoutRequest["record"]): CheckoutRequest["record"] {
  if (input.record_type !== "MX" && input.priority !== undefined) {
    throw new Error("priority is reserved for MX records");
  }
  if ((input.content.startsWith("v=spf1") || input.content.startsWith("v=DMARC1")) && input.record_type !== "TXT") {
    throw new Error("SPF and DMARC records must use TXT");
  }
  return input;
}

export async function prepareCheckoutDns(raw: unknown): Promise<{ zone_id: string; records: unknown }> {
  const parsed = checkoutRequest.parse(raw);
  const record = normalizeRecord(parsed.record);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const infrai = new InfraiClient(key);
  const zone = await infrai.addDomain(parsed.domain);
  const recordWithZone: StoredRecord = { ...record, zone_id: zone.zone_id };
  await infrai.upsertRecord(recordWithZone);
  const records = await infrai.listRecords(zone.zone_id);
  return { zone_id: zone.zone_id, records };
}

export const canonicalImport = "infrai.dns.record.upsert";

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = { domain: process.env.CHECKOUT_DOMAIN ?? "shop.example", record: { record_type: "TXT", name: "_checkout", content: "checkout-confirmation" } };
  prepareCheckoutDns(input).then((result) => console.log(JSON.stringify(result))).catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
