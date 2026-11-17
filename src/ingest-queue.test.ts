import test from "node:test";
import assert from "node:assert/strict";
import { SignatureQueue } from "./ingest-queue.js";
test("requires a database pool and implements durable queue operations", () => {
  assert.equal(typeof SignatureQueue.prototype.enqueue,"function");
  assert.equal(typeof SignatureQueue.prototype.claim,"function");
  assert.equal(typeof SignatureQueue.prototype.retry,"function");
  assert.equal(typeof SignatureQueue.prototype.complete,"function");
});
