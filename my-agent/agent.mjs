import { requireAgentName } from "../shared/config.mjs";
import { GREETING } from "./support/scenario.mjs";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  AutoSubscribe,
  cli,
  defineAgent,
  ServerOptions,
  voice,
  llm,
} from "@livekit/agents";
import { createModels, modelConfig } from "./models.mjs";
import {
  LocalVideoTrack,
  TrackSource,
  VideoBufferType,
  VideoFrame,
  VideoSource,
} from "@livekit/rtc-node";
import { drawFace, FPS, HEIGHT, WIDTH } from "./face.mjs";
import { createOutcomeStore } from "./support/outcome-store.mjs";
import { createVoiceGuide } from "./support/voice-guide.mjs";
import { createTurnInterpreter } from "./support/turn-interpreter.mjs";
import { SupportAgent } from "./support/support-agent.mjs";
import { createParallelSearch } from "./support/parallel-search.mjs";
import { greetOnBridgeReady, openingGate } from "./greet.mjs";
import { turnHandling, greetingOptions } from "./voice-options.mjs";

// Edit this file for the agent's role and demo context, then restart both processes.
const instructions = readFileSync(
  new URL("./agent-context.md", import.meta.url),
  "utf8",
);
// Said once, as soon as FaceTime is ready. Keep it short: it is the first thing the caller hears.

const greeting = GREETING;

export default defineAgent({
  entry: async (ctx) => {
    // Validate credentials when a job starts, without opening a model session.
    const config = modelConfig();
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_ALL);
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session. Doctor jobs may end
    // without a caller ever joining.
    const caller = await ctx.waitForParticipant();
    const supportSearch = createParallelSearch();
    const saveOutcome = createOutcomeStore(ctx.room.name);
    const guide = createVoiceGuide((state) => {
      saveOutcome(state);
      console.log(
        JSON.stringify({
          resolve_event: "guide_state",
          room: ctx.room.name,
          ...state,
        }),
      );
    });
    const session = new voice.AgentSession({
      ...createModels(config),
      turnHandling,
      userAwayTimeout: null,
    });
    // Safe diagnostics: lifecycle and counts only, never transcripts or credentials.
    const diagnostic = (event, detail = {}) =>
      console.log(
        JSON.stringify({
          resolve_event: event,
          room: ctx.room.name,
          at: new Date().toISOString(),
          ...detail,
        }),
      );
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (e) => {
      if (e.isFinal)
        diagnostic("caller_transcribed", { characters: e.transcript.length });
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (e) =>
      diagnostic("agent_state", { state: e.newState }),
    );
    session.on(voice.AgentSessionEventTypes.AgentFalseInterruption, (e) =>
      diagnostic("false_interruption", { resumed: e.resumed }),
    );
    session.on(voice.AgentSessionEventTypes.Error, (e) =>
      diagnostic("provider_error", {
        type: e.error?.type,
        recoverable: e.error?.recoverable,
      }),
    );
    session.on(voice.AgentSessionEventTypes.Close, (e) => {
      guide.finish();
      supportSearch.close();
      diagnostic("session_closed", { reason: e.reason });
    });
    const speakOpening = openingGate(
      session,
      greeting,
      greetingOptions,
      diagnostic,
    );
    const source = new VideoSource(WIDTH, HEIGHT);
    const track = LocalVideoTrack.createVideoTrack("resolve-avatar", source);
    let tick = 0,
      speaking = false;
    const frame = () =>
      source.captureFrame(
        new VideoFrame(
          drawFace(tick++, speaking),
          WIDTH,
          HEIGHT,
          VideoBufferType.RGBA,
        ),
      );
    frame();
    await ctx.room.localParticipant.publishTrack(track, {
      source: TrackSource.SOURCE_CAMERA,
    });
    const timer = setInterval(frame, 1000 / FPS);
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
      speaking = event.newState === "speaking";
    });
    ctx.addShutdownCallback(async () => {
      supportSearch.close();
      clearInterval(timer);
      await session.close();
      await track.close();
      await source.close();
    });
    await session.start({
      room: ctx.room,
      agent: new SupportAgent(
        {
          instructions,
          tools: {
            lookup_garmin_support: llm.tool({
              description:
                "After hearing the symptom, search official Garmin instructions and button controls in parallel. Extra conditions, firmware issues, customer reports and escalation context run in the background. Supply a concise symptom without personal information or serial numbers. On a changed symptom or reported firmware, call again. Only documentation/controls are repair evidence; background results are hypotheses.",
              parameters: {
                type: "object",
                properties: {
                  topic: {
                    type: "string",
                    enum: ["touch", "lock", "buttons", "context"],
                  },
                  model: { type: "string" },
                  symptom: { type: "string", maxLength: 300 },
                  firmware: {
                    type: "string",
                    maxLength: 40,
                    description:
                      "Reported firmware version, or empty if unknown. Never guess.",
                  },
                },
                required: ["topic", "model", "symptom"],
                additionalProperties: false,
              },
              execute: (args) => supportSearch.search(args),
            }),
            read_garmin_background: llm.tool({
              description:
                "Read already available background context immediately, without network requests or waiting. Check at most once per caller turn after a lookup. If pending, continue with official guidance; never poll in a loop. No automatic speech is triggered by background completion.",
              execute: () => supportSearch.readBackground(),
            }),
          },
        },
        supportSearch,
        guide,
        createTurnInterpreter(),
      ),
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: true,
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Greet once when chert dev reports that FaceTime is ready (bridge_ready in the
    // room metadata): the Mac ends the call if it hears nothing within 10 seconds
    // of that. Participant arrival alone is not readiness, so there is no greeting
    // on it. Without the signal there is no greeting, and the caller speaks first.
    // Speak the fixed greeting directly so the ten-second deadline doesn't depend
    // on an LLM round trip. say() also adds the greeting to conversation history.
    const stopGreeting = greetOnBridgeReady(ctx.room, speakOpening);
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: requireAgentName(),
  }),
);
