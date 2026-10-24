import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createParallelSearch } from "../support/parallel-search.mjs";
import { MODEL, TOUCH_URL } from "../support/keenable.mjs";
const args = {
  model: MODEL,
  topic: "touch",
  symptom: "touchscreen not responding",
};
const page = {
  url: TOUCH_URL,
  title: "Forerunner 165 Manual",
  content:
    "# Touch\nHold UP and select System > Touch. Customize touch for general watch use and activity profiles. Not available during swimming.",
};
function client(background = async () => ({ results: [] })) {
  return {
    search: (query, options) =>
      options.site === "www8.garmin.com"
        ? Promise.resolve({ results: [{ url: TOUCH_URL }] })
        : background(query, options),
    fetch: async (url) => ({ ...page, url }),
  };
}
test("official docs and controls start together; pending context never blocks priority response", async () => {
  const starts = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const fake = client(() => new Promise(() => {}));
  fake.fetch = async (url) => {
    starts.push(url);
    await gate;
    return { ...page, url };
  };
  const search = createParallelSearch({
    client: fake,
    backgroundBudgetMs: 1000,
  });
  try {
    const result = search.search(args);
    await delay(0);
    assert.equal(starts.length, 2);
    release();
    const r = await result;
    assert.equal(r.documentation.status, "retrieved");
    assert.equal(r.controls.status, "retrieved");
    assert.equal(r.background.status, "pending");
    assert.equal(Object.keys(r.background.lanes).length, 4);
  } finally {
    search.close();
  }
});
test("context filters wrong models and lookalike hosts and appears on nonblocking read", async () => {
  let resolve;
  const gate = new Promise((r) => {
    resolve = r;
  });
  const search = createParallelSearch({
    client: client(async (_q, o) => {
      await gate;
      return {
        results: [
          {
            title: "Forerunner 165 release",
            snippet: "Possible issue",
            url: `https://${o.site}/valid`,
          },
          {
            title: "Forerunner 265",
            snippet: "Wrong watch",
            url: `https://${o.site}/wrong`,
          },
          {
            title: "Forerunner 165",
            snippet: "Fake host",
            url: `https://${o.site}.evil.test/fake`,
          },
        ],
      };
    }),
  });
  try {
    await search.search(args);
    resolve();
    await delay(0);
    const r = search.readBackground();
    assert.equal(r.status, "complete");
    for (const lane of Object.values(r.lanes)) {
      assert.equal(lane.sources.length, 1);
      assert.equal(lane.status, "ready");
    }
  } finally {
    search.close();
  }
});
test("changed symptom replaces background; duplicate lookup reuses requests", async () => {
  const pending = [];
  const search = createParallelSearch({
    client: client(
      (query, options) =>
        new Promise((resolve) => pending.push({ query, options, resolve })),
    ),
  });
  try {
    await search.search(args);
    await search.search(args);
    assert.equal(pending.length, 4);
    await search.search({
      ...args,
      symptom: "only during calls",
      firmware: "27.09",
    });
    assert.equal(pending.length, 8);
    assert.ok(pending.slice(0, 4).every((r) => r.options.signal.aborted));
    for (const p of pending.slice(0, 4))
      p.resolve({
        results: [
          {
            title: "Forerunner 165 old",
            snippet: "stale",
            url: `https://${p.options.site}/old`,
          },
        ],
      });
    await delay(0);
    assert.equal(search.readBackground().search_id, 2);
    assert.ok(
      Object.values(search.readBackground().lanes).every(
        (l) => l.status === "pending",
      ),
    );
  } finally {
    search.close();
  }
});
test("background failures and deadline are contained; official failure preserves script", async () => {
  const fake = client(() => new Promise(() => {}));
  fake.fetch = async () => {
    throw Error("private transport details");
  };
  const search = createParallelSearch({ client: fake, backgroundBudgetMs: 10 });
  try {
    const r = await search.search(args);
    assert.equal(r.documentation.status, "scripted_fallback");
    await delay(20);
    assert.ok(
      Object.values(search.readBackground().lanes).every(
        (l) => l.status === "unavailable",
      ),
    );
    assert.ok(!JSON.stringify(r).includes("private transport details"));
  } finally {
    search.close();
  }
});
test("closing cancels all lanes and prevents later calls; unsupported model makes no request", async () => {
  const signals = [];
  const search = createParallelSearch({
    client: client((_q, o) => {
      signals.push(o.signal);
      return new Promise(() => {});
    }),
  });
  assert.equal(
    (await search.search({ ...args, model: "Garmin Venu" })).status,
    "unsupported_model",
  );
  assert.equal(signals.length, 0);
  await search.search(args);
  search.close();
  assert.ok(signals.every((s) => s.aborted));
  assert.equal(search.readBackground().status, "closed");
  assert.equal((await search.search(args)).status, "closed");
});
