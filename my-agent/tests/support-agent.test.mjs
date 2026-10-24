import { test } from "node:test";
import assert from "node:assert/strict";
import { SupportAgent } from "../support/support-agent.mjs";
import { createVoiceGuide } from "../support/voice-guide.mjs";
test("actual agent bypasses searches throughout scripted repair and streams each step", async () => {
  const agent = new SupportAgent(
    { instructions: "Test" },
    {
      search() {
        throw Error("demo must not search");
      },
      readBackground() {
        throw Error("demo must not search");
      },
    },
    createVoiceGuide(),
  );
  const turns = [
    ["My touchscreen does not respond", "on and bright"],
    ["It is on and bright", "Maybe"],
    ["Activities and apps", "System"],
    ["System is open", "Select Touch"],
    ["Off", "choose on"],
    ["On", "swipe"],
    ["Yes it works", "Anything else"],
    ["No thanks", "keep"],
    ["Keep it", "captured"],
  ];
  for (const [input, expected] of turns) {
    await agent.onUserTurnCompleted({}, { textContent: input });
    const stream = await agent.llmNode({}, {}, {});
    let output = "";
    for await (const chunk of stream) output += chunk;
    assert.ok(output.includes(expected), output);
  }
  assert.equal(agent.guide.outcome.status, "resolved");
  assert.equal(agent.guide.outcome.preference, "keep");
});
