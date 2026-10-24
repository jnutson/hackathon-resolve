import {
  AccessToken,
  RoomServiceClient,
  AgentDispatchClient,
} from "livekit-server-sdk";
import {
  requiredCallSettings,
  missingSettings,
  allowedOrigin,
} from "../shared/config.mjs";
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
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const canRetry = (a) =>
  !!(
    a &&
    a.status === "failed" &&
    a.rejected === true &&
    a.errorCode === "line_busy" &&
    a.cleaned &&
    !a.callId &&
    Date.now() >= a.retryAfter
  );
const summary = (a) =>
  a
    ? { status: a.status, message: a.message, retryable: canRetry(a) }
    : { status: "idle" };
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!allowedOrigin(url, env)) return json({ error: "Invalid host" }, 403);
    if (url.pathname === "/agent")
      return Response.redirect(url.origin + "/agent/", 308);
    if (url.pathname.startsWith("/agent/api/")) {
      if (
        !["/agent/api/status", "/agent/api/troubleshooting-call"].includes(
          url.pathname,
        )
      )
        return json({ error: "Not found" }, 404);
      if (
        request.method === "POST" &&
        request.headers.get("origin") !== url.origin
      )
        return json({ error: "Invalid origin" }, 403);
      const id = env.CALLS.idFromName(
        "verified-demo-recipient-" + (env.DEMO_ATTEMPT_ID || "v1"),
      );
      return env.CALLS.get(id).fetch(request);
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return json({ error: "Method not allowed" }, 405);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    if (headers.get("Content-Type")?.includes("text/html"))
      headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  },
};
export class CallCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    const sdk = (env.LIVEKIT_URL || "https://unconfigured.invalid")
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:");
    this.rooms = new RoomServiceClient(
      sdk,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );
    this.dispatch = new AgentDispatchClient(
      sdk,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );
  }
  async fetch(request) {
    const path = new URL(request.url).pathname,
      missing = missingSettings(this.env, requiredCallSettings);
    if (request.method === "GET" && path === "/agent/api/status")
      return json({
        ...summary(await this.ctx.storage.get("attempt")),
        configured: !missing.length,
        missing,
        phone: this.env.CHERT_TEST_PHONE
          ? "••• " + this.env.CHERT_TEST_PHONE.slice(-4)
          : "not configured",
      });
    if (request.method !== "POST" || path !== "/agent/api/troubleshooting-call")
      return json({ error: "Not found" }, 404);
    if (missing.length)
      return json({ error: "Call service configuration is incomplete." }, 503);
    if (!/^\+[1-9]\d{7,14}$/.test(this.env.CHERT_TEST_PHONE))
      return json(
        { error: "Invalid verified destination configuration." },
        503,
      );
    if (Number(request.headers.get("content-length")) > 1024)
      return json({ error: "Too large" }, 413);
    const reader = request.body?.getReader();
    let chunks = [],
      size = 0;
    if (!reader) return json({ error: "Invalid request" }, 400);
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024) {
        await reader.cancel();
        return json({ error: "Too large" }, 413);
      }
      chunks.push(value);
    }
    let data;
    try {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Invalid request" }, 400);
    }
    if (
      data.consent !== true ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data.requestId || "",
      )
    )
      return json({ error: "Explicit consent is required." }, 400);
    const duplicate = await this.ctx.storage.transaction(async (txn) => {
      const previous = await txn.get("attempt");
      if (previous && (!canRetry(previous) || previous.id === data.requestId))
        return previous;
      if (previous) await txn.put("history:" + previous.id, previous);
      await txn.put("attempt", {
        id: data.requestId,
        room: "resolve-" + crypto.randomUUID(),
        status: "queued",
        message: "Preparing your call…",
        at: Date.now(),
      });
      await txn.setAlarm(Date.now() + 100);
      return null;
    });
    if (duplicate)
      return json(
        {
          error:
            "A call has already been requested. No duplicate will be placed.",
          ...summary(duplicate),
        },
        409,
      );
    return json({ status: "queued", message: "Preparing your call…" }, 202);
  }
  async save(a) {
    await this.ctx.storage.put("attempt", a);
  }
  async chert(path, method = "GET", body, id) {
    const r = await fetch("https://facetime.trychert.com/api/v1" + path, {
      method,
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + this.env.CHERT_API_KEY,
        "X-Chert-Project-Id": this.env.CHERT_PROJECT_ID,
        "Content-Type": "application/json",
        ...(id ? { "Idempotency-Key": id } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const raw = d.error?.code || d.code || "provider_error";
      const e = new Error(
        /^[a-zA-Z0-9_-]+$/.test(raw) ? raw : "provider_error",
      );
      e.rejected = r.status >= 400 && r.status < 500;
      e.requestId = d.request_id;
      throw e;
    }
    if (!d.data) throw new Error("invalid_provider_response");
    return d.data;
  }
  async cleanup(a) {
    try {
      await this.rooms.deleteRoom(a.room);
      a.cleaned = true;
      await this.save(a);
    } catch {
      /* retain state for operator review */
    }
  }
  async alarm() {
    const a = await this.ctx.storage.get("attempt");
    if (!a) return;
    if (a.status === "queued") {
      await this.prepare(a);
      return;
    }
    if (a.callId && !terminal.has(a.status) && a.status !== "needs_review") {
      await this.monitor(a);
      return;
    }
    if (!terminal.has(a.status)) {
      a.status = "needs_review";
      a.message = "Call setup was interrupted. Check Chert before retrying.";
      await this.save(a);
    }
  }
  async prepare(a) {
    a.status = "preparing";
    await this.save(a);
    await this.ctx.storage.setAlarm(Date.now() + 90000);
    try {
      await this.rooms.createRoom({
        name: a.room,
        emptyTimeout: 120,
        maxParticipants: 2,
      });
      await this.dispatch.createDispatch(a.room, this.env.AGENT_NAME);
      let agent;
      for (let i = 0; i < 40; i++) {
        const members = await this.rooms.listParticipants(a.room);
        agent = members.find((p) => p.identity.startsWith("agent-"));
        if (agent) break;
        await delay(250);
      }
      if (!agent) throw new Error("agent_not_ready");
      const token = new AccessToken(
        this.env.LIVEKIT_API_KEY,
        this.env.LIVEKIT_API_SECRET,
        { identity: "chert-bridge-" + a.id, ttl: "30m" },
      );
      token.addGrant({
        roomJoin: true,
        room: a.room,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      });
      a.status = "requesting";
      a.message = "Requesting your FaceTime call…";
      await this.save(a);
      const call = await this.chert(
        "/calls",
        "POST",
        {
          direction: "outbound",
          mode: "customer_managed",
          line_id: this.env.CHERT_LINE_ID,
          destination: this.env.CHERT_TEST_PHONE,
          destination_type: "phone",
          media: { audio: true, video: false },
          livekit_url: this.env.LIVEKIT_URL,
          participant_token: await token.toJwt(),
          remote_participant_identity: agent.identity,
        },
        a.id,
      );
      if (!call.id) throw new Error("invalid_provider_response");
      a.callId = call.id;
      a.status = "allocated";
      a.message = "Call requested. Please answer FaceTime.";
      await this.save(a);
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    } catch (error) {
      const uncertain = a.status === "requesting" && !error.rejected;
      a.rejected = error.rejected === true;
      a.errorCode = error.message;
      a.retryAfter = Date.now() + 30000;
      console.log(
        JSON.stringify({
          event: "call_setup_failed",
          code: a.errorCode,
          requestId: error.requestId,
          rejected: a.rejected,
        }),
      );
      a.status = uncertain ? "needs_review" : "failed";
      a.message = uncertain
        ? "Call outcome is unknown. Check Chert before retrying."
        : `Call could not start (${/^[a-zA-Z0-9_-]+$/.test(error.message) ? error.message : "provider_error"}).`;
      if (a.rejected && a.errorCode === "line_busy")
        a.message =
          "Chert rejected the call because its line is busy. No call was placed. You can retry after 30 seconds.";
      await this.save(a);
      await this.ctx.storage.deleteAlarm();
      if (!uncertain) await this.cleanup(a);
    }
  }
  async monitor(a) {
    if (Date.now() - a.at > 360000) {
      a.status = "needs_review";
      a.message = "Check Chert for the final call status. No automatic redial.";
      await this.save(a);
      return;
    }
    try {
      const call = await this.chert("/calls/" + a.callId);
      if (
        call.id !== a.callId ||
        call.project_id !== this.env.CHERT_PROJECT_ID ||
        call.line_id !== this.env.CHERT_LINE_ID
      )
        throw new Error("call_identity_mismatch");
      const state = call.status || call.state;
      if (terminal.has(state)) {
        a.status = state;
        a.message = "Call ended.";
        await this.save(a);
        await this.cleanup(a);
        return;
      }
      if (
        state === "active" &&
        (call.facetime_call_events || []).some(
          (e) => e.event_type === "bridge_ready" && e.source === "worker",
        ) &&
        !a.greetSignaled
      ) {
        await this.rooms.updateRoomMetadata(
          a.room,
          JSON.stringify({ chert_bridge_ready: true, chert_call: a.callId }),
        );
        a.greetSignaled = true;
        a.status = "bridge_ready";
        a.message = "Your call is connected.";
        await this.save(a);
      }
    } catch {
      /* read failures never trigger a second call */
    }
    await this.ctx.storage.setAlarm(Date.now() + 1000);
  }
}
