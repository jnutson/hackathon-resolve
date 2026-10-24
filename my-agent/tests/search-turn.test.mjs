import test from "node:test";
import assert from "node:assert/strict";
import { createSearchTurn, searchIntent } from "../support/search-turn.mjs";
test("automatic routing uses symptom categories, never serial or personal transcript", () => {
  assert.equal(
    searchIntent("My serial is 123456 and my touch screen stopped working")
      .topic,
    "touch",
  );
  assert.equal(searchIntent("There is a padlock").topic, "lock");
  assert.equal(searchIntent("Can you hear me?"), null);
  assert.equal(searchIntent("No padlock is showing"), null);
});
test("retrieves without model tool calls, avoids duplicates, and adds later context without waiting", async () => {
  const requests = [],
    messages = [];
  let background = { status: "pending" };
  const turn = createSearchTurn({
    search: async (a) => {
      requests.push(a);
      return { documentation: { status: "retrieved" }, background };
    },
    readBackground: () => background,
  });
  const ctx = { addMessage: (m) => messages.push(m) };
  await turn(ctx, {
    textContent: "My touchscreen is not working, serial 12345",
  });
  assert.equal(requests.length, 1);
  assert.ok(!JSON.stringify(requests).includes("12345"));
  await turn(ctx, { textContent: "The touchscreen still does not work" });
  assert.equal(requests.length, 1);
  background = { status: "complete", lanes: { firmware: { status: "ready" } } };
  await turn(ctx, { textContent: "Yes, the display is lit" });
  assert.equal(messages.length, 2);
  assert.match(messages[1].content, /Background support reference/);
  await turn(ctx, { textContent: "Firmware version 27.09" });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].firmware, "27.09");
});
