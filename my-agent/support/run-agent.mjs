// Keep parent IPC heartbeats running when macOS would otherwise idle-sleep.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
const agent = spawn(
  process.execPath,
  ["--env-file=.env.local", "agent.mjs", "start", ...process.argv.slice(2)],
  { cwd, stdio: "inherit" },
);
const awake =
  process.platform === "darwin"
    ? spawn("/usr/bin/caffeinate", ["-i", "-w", String(agent.pid)], {
        stdio: "ignore",
      })
    : null;
awake?.on("error", () => {
  console.error(
    "Could not hold an idle-sleep assertion; keep this machine awake manually.",
  );
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => agent.kill(signal));
agent.on("error", () => {
  awake?.kill("SIGTERM");
  process.exitCode = 1;
});
agent.on("exit", (code) => {
  awake?.kill("SIGTERM");
  process.exitCode = code ?? 1;
});
