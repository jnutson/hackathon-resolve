// Synthetic speech through the complete session, without a phone call or recording.
import { initializeLogger, voice } from "@livekit/agents";
import { AudioFrame } from "@livekit/rtc-node";
import { createModels } from "../models.mjs";
import { turnHandling, greetingOptions } from "../voice-options.mjs";
initializeLogger({ pretty: false, level: "error" });
const timer = setTimeout(() => {
  console.error("FAIL: voice session timed out");
  process.exit(1);
}, 60000);
let input;
const stream = new ReadableStream({
  start(c) {
    input = c;
  },
});
class Input extends voice.AudioInput {
  get stream() {
    return stream;
  }
  async close() {
    try {
      input.close();
    } catch {}
  }
}
class Output extends voice.AudioOutput {
  frames = 0;
  segments = 0;
  seconds = 0;
  async captureFrame(frame) {
    await super.captureFrame(frame);
    if (this.seconds === 0) this.onPlaybackStarted(Date.now());
    this.frames++;
    this.seconds += frame.samplesPerChannel / frame.sampleRate;
  }
  flush() {
    super.flush();
    this.segments++;
    this.onPlaybackFinished({
      playbackPosition: this.seconds,
      interrupted: false,
    });
    this.seconds = 0;
  }
  clearBuffer() {
    this.onPlaybackFinished({
      playbackPosition: this.seconds,
      interrupted: true,
    });
    this.seconds = 0;
  }
}
const models = createModels(),
  session = new voice.AgentSession({
    ...models,
    turnHandling,
    userAwayTimeout: null,
  });
const output = new Output();
let transcribed = false,
  replied = false;
session.on(voice.AgentSessionEventTypes.AgentStateChanged, (e) =>
  console.log("STATE:", e.newState),
);
session.on(voice.AgentSessionEventTypes.Error, (e) =>
  console.log("ERROR:", e.error.type, e.error.recoverable),
);
session.input.audio = new Input();
session.output.audio = output;
session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (e) => {
  if (e.isFinal && e.transcript.trim()) {
    transcribed = true;
    console.log("PASS: session transcribed synthetic caller speech");
  }
});
session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (e) => {
  if (e.item.role === "assistant" && transcribed) {
    replied = true;
    console.log("PASS: session generated its reply");
  }
});
try {
  await session.start({
    agent: new voice.Agent({
      instructions:
        "You are Resolve. Briefly confirm you can hear the caller and ask one short question.",
    }),
    record: false,
  });
  await session
    .say("Hello, this is Resolve.", greetingOptions)
    .waitForPlayout();
  console.log("PASS: uninterrupted opening speech");
  let callerRate;
  const speech = models.tts.stream();
  speech.updateInputStream(
    new ReadableStream({
      start(c) {
        c.enqueue("Can you hear me? Please say hello.");
        c.close();
      },
    }),
  );
  for await (const chunk of speech) {
    if (chunk.frame) {
      callerRate = chunk.frame.sampleRate;
      input.enqueue(chunk.frame);
      await new Promise((r) =>
        setTimeout(
          r,
          (chunk.frame.samplesPerChannel / chunk.frame.sampleRate) * 1000,
        ),
      );
    }
  }
  speech.close();
  const rate = callerRate;
  const audioSilence = new AudioFrame(
    new Int16Array(rate / 20),
    rate,
    1,
    rate / 20,
  );
  for (let i = 0; i < 500; i++) {
    input.enqueue(audioSilence);
    await new Promise((r) => setTimeout(r, 50));
    if (replied && output.segments >= 2) break;
  }
  if (!transcribed || !replied || output.segments < 2)
    throw new Error("Full turn did not finish");
  console.log(
    "PASS: complete speech → transcription → model → reply audio, " +
      output.frames +
      " output frames",
  );
} catch (e) {
  console.error(
    "FAIL: full voice session (" +
      e.name +
      "), transcribed=" +
      transcribed +
      ", replied=" +
      replied +
      ", segments=" +
      output.segments,
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await session.close();
  await models.stt.close();
  await models.tts.close();
  process.exit(process.exitCode || 0);
}
