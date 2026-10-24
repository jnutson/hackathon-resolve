import test from "node:test";
import assert from "node:assert/strict";
import {
  createLookup,
  MODEL,
  TOUCH_URL,
  isModelManual,
  articleText,
} from "../support/keenable.mjs";
const page = {
  url: TOUCH_URL,
  title: "Forerunner 165 Owner Manual",
  content:
    "# Enabling and Disabling the Touchscreen\nHold UP and select System > Touch. Customize general use and each activity. Touch is unavailable during swimming.",
};
function fake(overrides = {}) {
  return {
    search: async () => ({ results: [{ url: TOUCH_URL }] }),
    fetch: async () => page,
    ...overrides,
  };
}
test("rejects another model, lookalike hosts, and non-HTTPS", async () => {
  for (const url of [
    TOUCH_URL.replace("www8.garmin.com", "www8.garmin.com.evil.test"),
    TOUCH_URL.replace("https:", "http:"),
    TOUCH_URL.replace("607F08F6", "12345678"),
  ])
    assert.equal(isModelManual(url), false);
  const result = await createLookup({
    client: fake({
      search: () => {
        throw Error("must not search");
      },
    }),
  })({ model: "Garmin Venu Sq", topic: "touch" });
  assert.equal(result.status, "unsupported_model");
});
test("full text is required and valid evidence is cached only within the call", async () => {
  let searches = 0;
  const lookup = createLookup({
    client: fake({
      search: async () => {
        searches++;
        return { results: [{ url: TOUCH_URL }] };
      },
    }),
  });
  assert.equal(
    (await lookup({ model: MODEL, topic: "touch" })).status,
    "retrieved",
  );
  assert.equal(
    (await lookup({ model: MODEL, topic: "touch" })).status,
    "session_cache",
  );
  assert.equal(searches, 1);
});
test("wrong-model pages, missing menu text, empty search and API errors use labeled fallback", async () => {
  for (const client of [
    fake({ fetch: async () => ({ ...page, title: "Forerunner 265" }) }),
    fake({ fetch: async () => ({ ...page, content: "Menu labels missing" }) }),
    fake({ search: async () => ({ results: [] }) }),
    fake({
      search: async () => {
        throw Error("secret error detail");
      },
    }),
  ]) {
    const result = await createLookup({ client })({
      model: MODEL,
      topic: "touch",
    });
    assert.equal(result.status, "scripted_fallback");
    assert.ok(!JSON.stringify(result).includes("secret error detail"));
  }
});
test("bounded timeout works even if provider ignores abort; no touch fallback for lock", async () => {
  const client = fake({ search: () => new Promise(() => {}) });
  assert.equal(
    (
      await createLookup({ client, budgetMs: 10 })({
        model: MODEL,
        topic: "touch",
      })
    ).reason,
    "timeout",
  );
  assert.equal(
    (
      await createLookup({ client, budgetMs: 10 })({
        model: MODEL,
        topic: "lock",
      })
    ).status,
    "unavailable",
  );
});

test("extracts plain article text but rejects truncated navigation", () => {
  assert.match(
    articleText(
      "Controls | Lock Device | Select to lock buttons and touchscreen.",
    ),
    /Lock Device/,
  );
  assert.equal(articleText("# Forerunner Owner’s Manual\nNavigation only"), "");
  assert.equal(articleText("Navigation ... content has been truncated"), "");
});
