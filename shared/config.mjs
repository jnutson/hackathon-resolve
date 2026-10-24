// Deployment identifiers have no defaults: a checkout must never dial another team's line.
export const requiredCallSettings = [
  "CHERT_API_KEY",
  "CHERT_PROJECT_ID",
  "CHERT_LINE_ID",
  "CHERT_TEST_PHONE",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "AGENT_NAME",
];
export function missingSettings(env, names = requiredCallSettings) {
  return names.filter(
    (name) =>
      !String(env[name] ?? "").trim() || String(env[name]).includes("YOUR_"),
  );
}
export function requireAgentName(env = process.env) {
  if (missingSettings(env, ["AGENT_NAME"]).length)
    throw new Error("Set AGENT_NAME to your registered LiveKit agent name.");
  return env.AGENT_NAME.trim();
}
export function allowedOrigin(url, env) {
  if (env.PUBLIC_ORIGIN) {
    try {
      return url.origin === new URL(env.PUBLIC_ORIGIN).origin;
    } catch {
      return false;
    }
  }
  return ["localhost", "127.0.0.1"].includes(url.hostname);
}
