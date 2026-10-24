import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVoiceGuide } from "../support/voice-guide.mjs";
import { createOutcomeStore } from "../support/outcome-store.mjs";
function ready(onChange) {
  const g = createVoiceGuide(onChange);
  assert.match(
    g.observe("I can't use the touch screen."),
    /on and bright.*dim/,
  );
  assert.match(
    g.observe("It is on and bright"),
    /Maybe.*turned off.*middle button/,
  );
  return g;
}
function atSetting(g) {
  g.observe("I see activities and apps.");
  g.observe("System is open.");
}
test("fast demo reaches repair without screening, verifies swipe and persists outcome and preference", () => {
  const dir = mkdtempSync(join(tmpdir(), "resolve-outcome-"));
  try {
    const g = ready(createOutcomeStore("test-room", dir));
    assert.match(g.observe("Activities and apps"), /highlight System/);
    assert.match(g.observe("System is open"), /Select Touch.*on or off/);
    assert.match(g.observe("It says off"), /choose on/);
    assert.match(g.observe("It now shows on"), /swipe.*Did that work/);
    assert.equal(g.outcome.status, "in_progress");
    assert.match(g.observe("Yes, it works now"), /confirmed.*Anything else/);
    assert.equal(g.outcome.status, "resolved");
    assert.match(g.observe("No, that is all"), /keep.*return/);
    assert.match(g.observe("Keep it"), /preference is captured/);
    g.finish();
    const saved = readFileSync(join(dir, "call-outcomes.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse)
      .at(-1);
    assert.equal(saved.status, "resolved");
    assert.equal(saved.swipeVerified, true);
    assert.equal(saved.preference, "keep");
    assert.equal(saved.settingBefore, "off");
    assert.equal(saved.settingAfter, "on");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("already enabled, failed swipe, and early hangup never record resolution", () => {
  const g = ready();
  atSetting(g);
  assert.match(g.observe("On"), /not fixed/);
  assert.equal(g.outcome.status, "unresolved");
  const h = ready();
  atSetting(h);
  h.observe("Off");
  h.observe("On");
  h.observe("No, it does not work");
  assert.equal(h.outcome.status, "unresolved");
  const i = ready();
  atSetting(i);
  i.observe("Off");
  i.observe("On");
  i.finish();
  assert.equal(i.outcome.status, "unconfirmed");
  assert.equal(i.outcome.swipeVerified, false);
});
test("repeat and wait preserve step, menu vocabulary progresses, repeated unknown menus exit loop", () => {
  const g = ready();
  const first = g.observe("Which button?");
  assert.match(first, /middle button/);
  assert.doesNotMatch(first, /\bUP\b|\bSTART\b/);
  assert.equal(g.stage, "menu");
  g.observe("Hold on");
  assert.equal(g.stage, "menu");
  assert.match(g.observe("I see appearance"), /System/);
  assert.match(g.observe("I cannot see it"), /labels/);
  assert.equal(g.stage, "system");
  assert.match(g.observe("Still cannot see it"), /pause here/);
  assert.equal(g.stage, "system");
});
test("unrelated symptom does not enter demo; explicit lock exits prepared repair", () => {
  const g = createVoiceGuide();
  assert.equal(g.observe("The battery drains fast"), null);
  g.observe("Touch is not working");
  assert.match(g.observe("I see a padlock"), /may not apply/);
  assert.equal(g.outcome.status, "unresolved");
});

test("brightness question precedes repair and dim display stays on wake step", () => {
  const g = createVoiceGuide();
  assert.match(g.observe("Touch does not work"), /on and bright.*dim/);
  assert.match(g.observe("It is dim"), /wake the display/);
  assert.equal(g.stage, "brightness");
  assert.match(
    g.observe("Now on and bright"),
    /Maybe the touchscreen is turned off/,
  );
  assert.equal(g.stage, "menu");
});
