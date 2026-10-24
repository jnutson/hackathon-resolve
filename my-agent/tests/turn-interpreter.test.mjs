import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTurnInterpreter,
  decodeInterpretation,
} from "../support/turn-interpreter.mjs";
import { SupportAgent } from "../support/support-agent.mjs";
import { createVoiceGuide } from "../support/voice-guide.mjs";
test("model can only select allowed transitions for current stage", () => {
  assert.deepEqual(decodeInterpretation({ intent: "worked" }, "brightness"), {
    intent: "unclear",
  });
  assert.equal(
    decodeInterpretation({ intent: "worked" }, "swipe").text,
    "Yes it works",
  );
  assert.equal(
    decodeInterpretation({ intent: "factory_reset" }, "menu").intent,
    "unclear",
  );
});
test("malformed and timed out model outputs are contained", async () => {
  const bad = createTurnInterpreter({ request: async () => "{invalid" });
  assert.equal(
    (await bad({ stage: "swipe", text: "okay" })).intent,
    "unavailable",
  );
  const slow = createTurnInterpreter({
    request: () => new Promise(() => {}),
    timeoutMs: 10,
  });
  assert.equal(
    (await slow({ stage: "swipe", text: "yes" })).intent,
    "unavailable",
  );
});
test("questions and ambiguity preserve step, paraphrases advance, only confirmed test resolves", async () => {
  const g = createVoiceGuide();
  let intent = "touch_problem";
  const interpret = createTurnInterpreter({
    request: async () => JSON.stringify({ intent }),
  });
  const a = new SupportAgent({ instructions: "test" }, {}, g, interpret);
  const turn = async (next, text) => {
    intent = next;
    await a.onUserTurnCompleted({}, { textContent: text });
  };
  await turn("touch_problem", "Dragging my finger does nothing");
  assert.equal(g.stage, "brightness");
  await turn("bright", "I can see everything clearly");
  assert.equal(g.stage, "menu");
  await turn("question", "Will this erase my runs?");
  assert.equal(g.stage, "menu");
  assert.match(a.nextGuideStep, /without resetting/);
  await turn("menu_open", "A list appeared");
  assert.equal(g.stage, "system");
  await turn("system_open", "I have opened the system section");
  assert.equal(g.stage, "touch");
  await turn("off", "It looks like disabled");
  assert.equal(g.stage, "enable");
  await turn("enabled", "I changed it to enabled");
  assert.equal(g.stage, "swipe");
  await turn("unclear", "Sure, I will try");
  assert.equal(g.outcome.status, "in_progress");
  await turn("worked", "The widgets move when I drag my finger now");
  assert.equal(g.outcome.status, "resolved");
});
