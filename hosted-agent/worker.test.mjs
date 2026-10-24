import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { CallCoordinator } from "./worker.mjs";
const env = {
  PUBLIC_ORIGIN: "https://demo.example",
  CHERT_PROJECT_ID: "test-project",
  CHERT_LINE_ID: "test-line",
  AGENT_NAME: "test-agent",
  CHERT_API_KEY: "test",
  CHERT_TEST_PHONE: "+15555550123",
  LIVEKIT_URL: "wss://example.invalid",
  LIVEKIT_API_KEY: "test",
  LIVEKIT_API_SECRET: "test",
};
function setup(values = env) {
  const map = new Map();
  let alarm;
  const storage = {
    get: async (k) => map.get(k),
    put: async (k, v) => map.set(k, v),
    setAlarm: async (v) => {
      alarm = v;
    },
    transaction: async (fn) => fn(storage),
  };
  return {
    coordinator: new CallCoordinator({ storage }, values),
    map,
    get alarm() {
      return alarm;
    },
  };
}
const post = (body) =>
  new Request("https://demo.example/agent/api/troubleshooting-call", {
    method: "POST",
    body: JSON.stringify(body),
  });
test("consent is required and duplicate submissions cannot enqueue a second call", async () => {
  const s = setup();
  assert.equal(
    (
      await s.coordinator.fetch(
        post({ consent: false, requestId: crypto.randomUUID() }),
      )
    ).status,
    400,
  );
  assert.equal(s.map.size, 0);
  assert.equal(
    (
      await s.coordinator.fetch(
        post({ consent: true, requestId: crypto.randomUUID() }),
      )
    ).status,
    202,
  );
  const first = s.map.get("attempt");
  assert.ok(s.alarm);
  assert.equal(
    (
      await s.coordinator.fetch(
        post({ consent: true, requestId: crypto.randomUUID() }),
      )
    ).status,
    409,
  );
  assert.equal(s.map.get("attempt"), first);
});
test("status masks phone and does not reveal API keys", async () => {
  const s = setup();
  const body = await (
    await s.coordinator.fetch(
      new Request("https://demo.example/agent/api/status"),
    )
  ).json();
  assert.equal(body.phone, "••• 0123");
  assert.equal(body.configured, true);
  assert.equal(body.CHERT_API_KEY, undefined);
  assert.equal(body.status, "idle");
});
test("public handler rejects cross-origin calls before forwarding", async () => {
  const r = await worker.fetch(
    new Request("https://demo.example/agent/api/troubleshooting-call", {
      method: "POST",
      headers: { Origin: "https://unrelated.invalid" },
      body: "{}",
    }),
    env,
  );
  assert.equal(r.status, 403);
});
test("base route redirects and unrelated hosts are rejected", async () => {
  assert.equal(
    (
      await worker.fetch(new Request("https://demo.example/agent"), env)
    ).headers.get("Location"),
    "https://demo.example/agent/",
  );
  assert.equal(
    (await worker.fetch(new Request("https://other.invalid/agent"), env))
      .status,
    403,
  );
});
test("only a cleaned, explicitly rejected busy attempt can be retried with new consent and ID", async () => {
  const s = setup();
  const id = crypto.randomUUID();
  const busy = {
    id,
    status: "failed",
    rejected: true,
    errorCode: "line_busy",
    cleaned: true,
    retryAfter: Date.now() - 1,
  };
  for (const variant of [
    { ...busy, callId: "existing" },
    { ...busy, status: "needs_review" },
    { ...busy, cleaned: false },
    { ...busy, rejected: false },
    { ...busy, retryAfter: Date.now() + 30000 },
  ]) {
    s.map.set("attempt", variant);
    assert.equal(
      (
        await s.coordinator.fetch(
          post({ consent: true, requestId: crypto.randomUUID() }),
        )
      ).status,
      409,
    );
  }
  s.map.set("attempt", busy);
  assert.equal(
    (await s.coordinator.fetch(post({ consent: true, requestId: id }))).status,
    409,
  );
  assert.equal(
    (
      await s.coordinator.fetch(
        post({ consent: true, requestId: crypto.randomUUID() }),
      )
    ).status,
    202,
  );
  assert.deepEqual(s.map.get("history:" + id), busy);
});
