import test from "node:test";
import assert from "node:assert/strict";
import { GarminSession } from "../support/controller.mjs";
function setup() {
  let now = 1000000,
    seq = 0;
  const s = new GarminSession({ now: () => now });
  const send = (type, fields = {}) => {
    now += 3000;
    return s.dispatch({
      id: String(++seq),
      type,
      version: s.version,
      ...fields,
    });
  };
  const observe = (fields = {}) =>
    send("observe", {
      captured_at: now + 3000,
      screen: "watch_face",
      display_on: true,
      gesture: "none",
      changed: false,
      button_pressed: false,
      touch_enabled: null,
      ...fields,
    });
  send("identify", { model: "Garmin Forerunner 165" });
  return { s, send, observe };
}
function navigate(x) {
  x.observe({ gesture: "swipe" });
  x.send("documentation", {
    mode: "cached",
    procedure_id: "garmin-165-enable-touch-v1",
  });
  for (const screen of ["settings", "system", "touch"]) x.observe({ screen });
  x.observe({ screen: "general_use", touch_enabled: false });
  x.observe({ screen: "touch_on", touch_enabled: true });
  x.observe();
}
test("inspect before retrieval; physical navigation then gesture and confirmation", () => {
  const x = setup();
  assert.throws(
    () =>
      x.send("documentation", {
        mode: "cached",
        procedure_id: "garmin-165-enable-touch-v1",
      }),
    /not permitted/,
  );
  navigate(x);
  assert.throws(() => x.send("confirm", { answer: "yes" }), /not permitted/);
  x.observe({ screen: "glances", gesture: "swipe", changed: true });
  x.send("confirm", { answer: "yes" });
  assert.equal(x.s.record.outcome, "resolved");
  assert.equal(x.s.record.diagnosis_code, "GENERAL_USE_TOUCH_DISABLED");
  x.send("choice", { value: "keep", source: "voice" });
  assert.equal(x.s.choice, "undecided");
  x.send("choice", { value: "keep", source: "page" });
  assert.equal(x.s.state, "COMPLETE");
});
test("button-caused screen movement cannot verify touch", () => {
  const x = setup();
  navigate(x);
  x.observe({
    screen: "glances",
    gesture: "swipe",
    changed: true,
    button_pressed: true,
  });
  assert.equal(x.s.state, "INSPECT_DEVICE");
  assert.equal(x.s.record, null);
});
test("enabled setting alone cannot resolve; failed swipe is unresolved", () => {
  const x = setup();
  navigate(x);
  assert.equal(x.s.record, null);
  x.observe({ gesture: "swipe" });
  assert.equal(x.s.record.outcome, "unresolved");
});
test("out-of-order menus do not issue setting changes", () => {
  const x = setup();
  x.observe({ gesture: "swipe" });
  x.send("documentation", {
    mode: "cached",
    procedure_id: "garmin-165-enable-touch-v1",
  });
  x.observe({ screen: "general_use", touch_enabled: false });
  assert.equal(x.s.steps.length, 1);
});
test("reject stale evidence and unknown fields", () => {
  const x = setup();
  assert.throws(() => x.observe({ captured_at: 0 }), /Stale/);
  assert.throws(() => x.observe({ timer: 3 }), /Unknown/);
});
test("duplicates are idempotent and disconnect stays unverified", () => {
  const x = setup();
  const e = { id: "disconnect", version: x.s.version, type: "disconnect" };
  x.s.dispatch(e);
  const version = x.s.version;
  x.s.dispatch(e);
  assert.equal(x.s.version, version);
  assert.equal(x.s.record.outcome, "unverified");
});
