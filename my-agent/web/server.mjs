import { requiredCallSettings, missingSettings } from "../../shared/config.mjs";
import http from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  AccessToken,
  RoomServiceClient,
  AgentDispatchClient,
} from "livekit-server-sdk";

const project = process.env.CHERT_PROJECT_ID;
const line = process.env.CHERT_LINE_ID;
const port = Number(process.env.PORT || 3000);
const origin = `http://localhost:${port}`;
const missing = missingSettings(process.env, requiredCallSettings);
const sdkUrl = (process.env.LIVEKIT_URL || "")
  .replace(/^wss:/, "https:")
  .replace(/^ws:/, "http:");
const rooms = missing.length
  ? null
  : new RoomServiceClient(
      sdkUrl,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
const dispatch = missing.length
  ? null
  : new AgentDispatchClient(
      sdkUrl,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
mkdirSync(".data", { recursive: true, mode: 0o700 });
const stateFile = ".data/outbound-attempt.json";
let attempt = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"))
  : null;
const save = () =>
  writeFileSync(stateFile, JSON.stringify(attempt), { mode: 0o600 });
const publicState = () =>
  attempt
    ? {
        status: attempt.status,
        message: attempt.message,
        callId: attempt.callId || null,
      }
    : { status: "idle" };
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const terminal = new Set([
  "ended",
  "failed",
  "rejected",
  "declined",
  "cancelled",
  "canceled",
  "completed",
  "busy",
  "no_answer",
]);
async function chert(path, method = "GET", body, key) {
  const response = await fetch(`https://facetime.trychert.com/api/v1${path}`, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${process.env.CHERT_API_KEY}`,
      "X-Chert-Project-Id": project,
      ...(key ? { "Idempotency-Key": key } : {}),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data.error?.code || data.code || `http_${response.status}`;
    // Return only a code, never provider bodies, URLs, headers, or tokens.
    const error = new Error(code);
    error.providerRejected = response.status >= 400 && response.status < 500;
    throw error;
  }
  return data.data;
}
async function cleanup() {
  if (attempt?.room) await rooms.deleteRoom(attempt.room).catch(() => {});
}
async function monitor() {
  for (let i = 0; i < 360; i++) {
    try {
      const call = await chert(`/calls/${attempt.callId}`);
      if (
        call.id !== attempt.callId ||
        call.project_id !== project ||
        call.line_id !== line
      )
        throw new Error("call_identity_mismatch");
      const status = call.status || call.state;
      if (terminal.has(status)) {
        attempt.status = status;
        attempt.message =
          "Call ended. Receipt and audio require your confirmation.";
        save();
        await cleanup();
        return;
      }
      const events = call.facetime_call_events || [];
      const ready =
        status === "active" &&
        events.some(
          (e) => e.event_type === "bridge_ready" && e.source === "worker",
        );
      if (ready && !attempt.greetSignaled) {
        await rooms.updateRoomMetadata(
          attempt.room,
          JSON.stringify({
            chert_bridge_ready: true,
            chert_call: attempt.callId,
          }),
        );
        attempt.greetSignaled = true;
        attempt.status = "bridge_ready";
        attempt.message =
          "Chert reports the audio bridge is ready. Please confirm you received the call.";
        save();
      }
    } catch {
      /* keep monitoring; never repeat create after an uncertain result */
    }
    await sleep(1000);
  }
  attempt.status = "needs_review";
  attempt.message =
    "Monitoring timed out. Check Chert before any retry; no automatic redial.";
  save();
}
async function placeCall() {
  attempt.status = "preparing";
  attempt.message = "Preparing a private room for Resolve…";
  save();
  try {
    await rooms.createRoom({
      name: attempt.room,
      emptyTimeout: 120,
      maxParticipants: 2,
    });
    await dispatch.createDispatch(attempt.room, process.env.AGENT_NAME);
    let agent;
    for (let i = 0; i < 40; i++) {
      const members = await rooms.listParticipants(attempt.room);
      agent = members.find((p) => p.identity.startsWith("agent-"));
      if (agent) break;
      await sleep(250);
    }
    if (!agent) throw new Error("agent_not_ready");
    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: `chert-bridge-${attempt.id}`, ttl: "30m" },
    );
    token.addGrant({
      roomJoin: true,
      room: attempt.room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    const body = {
      direction: "outbound",
      mode: "customer_managed",
      line_id: line,
      destination: process.env.CHERT_TEST_PHONE,
      destination_type: "phone",
      media: { audio: true, video: false },
      livekit_url: process.env.LIVEKIT_URL,
      participant_token: await token.toJwt(),
      remote_participant_identity: agent.identity,
    };
    attempt.status = "requesting";
    attempt.message = "Requesting one FaceTime Audio call…";
    save();
    const call = await chert("/calls", "POST", body, attempt.id);
    attempt.callId = call.id;
    attempt.status = "allocated";
    attempt.message =
      "Chert allocated the call. This does not yet confirm ringing or receipt.";
    save();
    void monitor();
  } catch (error) {
    const uncertain =
      attempt.status === "requesting" && !error.providerRejected;
    attempt.status = uncertain ? "needs_review" : "failed";
    attempt.message = uncertain
      ? "Call request outcome is unknown. Check Chert before retrying; no automatic redial."
      : `Call could not start (${/^[a-zA-Z0-9_-]+$/.test(error.message) ? error.message : "provider_error"}).`;
    save();
    if (!uncertain) await cleanup();
  }
}
http
  .createServer(async (req, res) => {
    if (!["localhost:" + port, "127.0.0.1:" + port].includes(req.headers.host))
      return json(res, 403, { error: "Invalid host" });
    if (
      req.method === "GET" &&
      req.url === "/assets/garmin-forerunner-165.png"
    ) {
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      });
      return res.end(
        readFileSync(
          new URL("./assets/garmin-forerunner-165.png", import.meta.url),
        ),
      );
    }
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
      });
      return res.end(readFileSync(new URL("./index.html", import.meta.url)));
    }
    if (req.method === "GET" && req.url === "/api/status")
      return json(res, 200, {
        ...publicState(),
        configured: !missing.length,
        missing,
        phone: process.env.CHERT_TEST_PHONE
          ? "••• " + process.env.CHERT_TEST_PHONE.slice(-4)
          : "not configured",
      });
    if (req.method === "POST" && req.url === "/api/troubleshooting-call") {
      if (
        req.headers.origin !== origin &&
        req.headers.origin !== `http://127.0.0.1:${port}`
      )
        return json(res, 403, { error: "Invalid origin" });
      if (missing.length)
        return json(res, 503, {
          error: "Private server configuration is incomplete.",
        });
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1024) return json(res, 413, { error: "Too large" });
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: "Invalid request" });
      }
      if (
        data.consent !== true ||
        !/^[0-9a-f-]{36}$/.test(data.requestId || "")
      )
        return json(res, 400, { error: "Explicit consent is required." });
      if (attempt)
        return json(res, 409, {
          error:
            "This test already has a call attempt. No duplicate call will be placed.",
          ...publicState(),
        });
      if (!/^\+[1-9]\d{7,14}$/.test(process.env.CHERT_TEST_PHONE))
        return json(res, 503, {
          error: "Verified number must use international format.",
        });
      attempt = {
        id: data.requestId,
        room: `unreturn-${randomUUID()}`,
        status: "preparing",
        at: new Date().toISOString(),
      };
      save();
      void placeCall();
      return json(res, 202, publicState());
    }
    json(res, 404, { error: "Not found" });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Resolve consent form: ${origin}`);
    if (missing.length)
      console.log("Missing variable names: " + missing.join(", "));
    if (attempt?.callId && !terminal.has(attempt.status)) void monitor();
  });
