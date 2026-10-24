import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("local call handler rejects absent consent, cross-origin calls, and duplicate attempts without dialing", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "unreturn-web-"));
  const port = 31974;
  mkdirSync(join(cwd, ".data"));
  writeFileSync(
    join(cwd, ".data/outbound-attempt.json"),
    JSON.stringify({ status: "failed", message: "Prior attempt" }),
  );
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../web/server.mjs", import.meta.url))],
    {
      cwd,
      env: {
        ...process.env,
        PORT: String(port),
        CHERT_PROJECT_ID: "test-project",
        CHERT_LINE_ID: "test-line",
        AGENT_NAME: "test-agent",
        CHERT_API_KEY: "test-only",
        CHERT_TEST_PHONE: "+15555550123",
        LIVEKIT_URL: "wss://example.invalid",
        LIVEKIT_API_KEY: "test-only",
        LIVEKIT_API_SECRET: "test-only",
      },
    },
  );
  t.after(() => {
    child.kill("SIGTERM");
    rmSync(cwd, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error("Server exited " + code)));
  });
  const base = `http://localhost:${port}`;
  const request = (body, origin = base) =>
    fetch(base + "/api/troubleshooting-call", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await request({ consent: false, requestId: crypto.randomUUID() })).status,
    400,
  );
  assert.equal(
    (
      await request(
        { consent: true, requestId: crypto.randomUUID() },
        "https://other.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (await request({ consent: true, requestId: crypto.randomUUID() })).status,
    409,
  );
  const state = await fetch(base + "/api/status").then((r) => r.json());
  assert.equal(state.phone, "••• 0123");
  assert.equal(state.status, "failed");
  assert.equal(JSON.stringify(state).includes("test-only"), false);
  assert.equal((await fetch(base)).status, 200);
});
