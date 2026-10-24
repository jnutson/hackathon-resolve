import test from "node:test";
import assert from "node:assert/strict";
import {
  missingSettings,
  requireAgentName,
  allowedOrigin,
} from "../../shared/config.mjs";
test("deployment identifiers must be explicitly configured", () => {
  const missing = missingSettings({});
  for (const name of ["CHERT_PROJECT_ID", "CHERT_LINE_ID", "AGENT_NAME"])
    assert.ok(missing.includes(name));
  assert.throws(() => requireAgentName({}));
  assert.throws(() => requireAgentName({ AGENT_NAME: "YOUR_AGENT_NAME" }));
  assert.equal(requireAgentName({ AGENT_NAME: "team-demo" }), "team-demo");
});
test("hosted origin uses exact configured origin and fails closed", () => {
  const env = { PUBLIC_ORIGIN: "https://demo.example" };
  assert.equal(
    allowedOrigin(new URL("https://demo.example/agent/"), env),
    true,
  );
  for (const url of [
    "http://demo.example/agent/",
    "https://demo.example.evil.test/agent/",
    "https://demo.example:8443/agent/",
  ])
    assert.equal(allowedOrigin(new URL(url), env), false);
  assert.equal(
    allowedOrigin(new URL("https://demo.example/agent/"), {}),
    false,
  );
  assert.equal(
    allowedOrigin(new URL("http://localhost:8787/agent/"), {}),
    true,
  );
});
