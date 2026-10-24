import test from "node:test";
import assert from "node:assert/strict";
import { modelConfig, alternatingContext } from "../models.mjs";
import { llm } from "@livekit/agents";

test("voice greeting and repeated caller turns preserve content with alternating model roles", () => {
  const original = new llm.ChatContext([
    new llm.ChatMessage({
      role: "system",
      content: "Ask one question, then wait.",
    }),
    new llm.ChatMessage({
      role: "assistant",
      content: "What is happening with your watch?",
    }),
    new llm.ChatMessage({ role: "user", content: "The touchscreen is stuck." }),
    new llm.ChatMessage({ role: "user", content: "Can you hear me?" }),
    new llm.ChatMessage({
      role: "assistant",
      content: "Yes. Are the buttons working?",
    }),
    new llm.ChatMessage({ role: "user", content: "Wait, I am checking." }),
  ]);
  const normalized = alternatingContext(original);
  assert.deepEqual(
    normalized.items.map((m) => m.role),
    ["system", "user", "assistant", "user"],
  );
  assert.match(normalized.items[0].textContent, /What is happening/);
  assert.match(
    normalized.items[1].textContent,
    /touchscreen.*[\s\S]*Can you hear me/,
  );
  assert.equal(original.items.length, 6);
  assert.equal(original.items[0].content.length, 1);
});

test("missing Nebius credentials never fall back to an OpenAI key", () => {
  for (const key of [undefined, "", " ", "YOUR_NEBIUS_API_KEY"]) {
    assert.throws(
      () => modelConfig({ NEBIUS_API_KEY: key, OPENAI_API_KEY: "unused" }),
      /NEBIUS_API_KEY/,
    );
  }
});

test("Nebius credentials are only sent to an approved Token Factory endpoint", () => {
  for (const endpoint of [
    "https://api.openai.com/v1",
    "http://api.tokenfactory.nebius.com/v1",
    "https://api.tokenfactory.nebius.com.evil.test/v1",
    "https://api.tokenfactory.nebius.com/v1?redirect=1",
  ]) {
    assert.throws(() =>
      modelConfig({ NEBIUS_API_KEY: "test", NEBIUS_BASE_URL: endpoint }),
    );
  }
  assert.equal(
    modelConfig({ NEBIUS_API_KEY: "test" }).llm.baseURL,
    "https://api.tokenfactory.nebius.com/v1",
  );
  assert.equal(
    modelConfig({
      NEBIUS_API_KEY: "test",
      NEBIUS_BASE_URL: "https://api.tokenfactory.us-central1.nebius.com/v1",
    }).llm.apiKey,
    "test",
  );
});

test("ordinary LiveKit lifecycle items do not prevent a voice reply", () => {
  const ctx = new llm.ChatContext([
    new llm.ChatMessage({ role: "system", content: "You are Resolve." }),
    new llm.AgentHandoffItem({ newAgentId: "resolve" }),
    new llm.AgentConfigUpdate({ toolsAdded: ["lookup_garmin_support"] }),
    new llm.ChatMessage({ role: "assistant", content: "Hello." }),
    new llm.ChatMessage({ role: "user", content: "Can you hear me?" }),
  ]);
  const normalized = alternatingContext(ctx);
  assert.deepEqual(
    normalized.items.map((m) => m.role),
    ["system", "user"],
  );
  assert.match(normalized.items[1].textContent, /Can you hear me/);
  assert.equal(ctx.items.length, 5);
});

test("support tool results remain available to Gemma as reference data", () => {
  const ctx = new llm.ChatContext([
    new llm.ChatMessage({ role: "user", content: "My watch is stuck." }),
    new llm.FunctionCall({
      callId: "one",
      name: "lookup_garmin_support",
      args: '{"topic":"touch"}',
    }),
    new llm.FunctionCallOutput({
      callId: "one",
      name: "lookup_garmin_support",
      output: "System > Touch",
      isError: false,
    }),
  ]);
  const normalized = alternatingContext(ctx);
  assert.deepEqual(
    normalized.items.map((m) => m.role),
    ["user", "assistant", "user"],
  );
  assert.match(normalized.items[2].textContent, /reference data/);
  assert.match(normalized.items[2].textContent, /System > Touch/);
});
