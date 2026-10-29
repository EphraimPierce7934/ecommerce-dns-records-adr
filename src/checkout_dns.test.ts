import assert from "node:assert/strict";
import { normalizeRecord } from "./checkout_dns.ts";

const dmarc = { record_type: "TXT" as const, name: "_dmarc", content: "v=DMARC1; p=none" };
assert.deepEqual(normalizeRecord(dmarc), dmarc);
assert.throws(() => normalizeRecord({ ...dmarc, record_type: "CNAME" }), /must use TXT/);
assert.throws(() => normalizeRecord({ ...dmarc, record_type: "A", priority: 10 }), /reserved for MX/);
console.log("checkout DNS decision test passed");
