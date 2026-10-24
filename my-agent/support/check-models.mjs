// Small billable provider checks. No room, microphone, call, or saved audio.
import assert from "node:assert/strict";
import { initializeLogger, llm, stt, inference } from "@livekit/agents";
import { AudioFrame, VideoFrame, VideoBufferType } from "@livekit/rtc-node";
import { setTimeout as delay } from "node:timers/promises";
import { createModels } from "../models.mjs";

// Avoid SDK error dumps that can include HTTP request details.
initializeLogger({ pretty: false, level: "fatal" });
const timeout = setTimeout(() => {
  console.error("FAIL: provider checks exceeded 60 seconds.");
  process.exit(1);
}, 60_000);
let stage = "configuration";
let models;
const connOptions = { maxRetry: 0, timeoutMs: 20_000, retryIntervalMs: 0 };
async function reply(chatCtx) {
  const stream = models.llm.chat({ chatCtx, toolChoice: "none", connOptions });
  try {
    let text = "";
    for await (const chunk of stream) text += chunk.delta?.content || "";
    assert.ok(text.trim(), "Empty model reply");
    return text.trim();
  } finally {
    stream.close();
  }
}
async function speak(text) {
  const stream = models.tts.stream({ connOptions });
  stream.updateInputStream(
    new ReadableStream({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      },
    }),
  );
  try {
    const frames = [];
    for await (const chunk of stream) if (chunk.frame) frames.push(chunk.frame);
    assert.ok(frames.length, "No synthesized audio");
    return frames;
  } finally {
    stream.close();
  }
}
try {
  models = createModels();
  stage = "Nebius text generation";
  const chatCtx = new llm.ChatContext();
  chatCtx.addMessage({
    role: "system",
    content:
      "You are an AI troubleshooting assistant. Ask one short question at a time.",
  });
  chatCtx.addMessage({
    role: "assistant",
    content: "What is happening with your watch?",
  });
  chatCtx.addMessage({
    role: "user",
    content: "My Garmin touchscreen stopped responding.",
  });
  chatCtx.addMessage({ role: "user", content: "Can you hear me?" });
  const response = await reply(chatCtx);
  console.log(
    `PASS: Nebius text generation (${models.llm.model}, ${models.llm.provider})`,
  );

  stage = "Nebius vision";
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i + 2] = 255;
    pixels[i + 3] = 255;
  }
  const visionCtx = new llm.ChatContext();
  visionCtx.addMessage({
    role: "user",
    content: [
      "Name the solid color in this image in one word.",
      llm.createImageContent({
        image: new VideoFrame(pixels, 64, 64, VideoBufferType.RGBA),
      }),
    ],
  });
  assert.match(await reply(visionCtx), /blue/i);
  console.log("PASS: Nebius vision recognized a synthetic blue image");

  stage = "Cartesia speech synthesis";
  const frames = await speak("My Garmin touchscreen stopped responding.");
  console.log(
    `PASS: Cartesia speech synthesis (${frames.length} audio frames)`,
  );

  stage = "Deepgram speech recognition";
  const stream = models.stt.stream({ connOptions });
  let transcript = "";
  try {
    const receive = (async () => {
      for await (const event of stream) {
        if (event.type === stt.SpeechEventType.FINAL_TRANSCRIPT) {
          transcript += event.alternatives?.[0]?.text || "";
          if (/touch\s*screen/i.test(transcript)) return;
        }
      }
    })();
    // Exercise the continuous input used on calls, including trailing silence
    // for Deepgram endpointing, rather than closing the socket immediately.
    for (const frame of frames) {
      stream.pushFrame(frame);
      await delay((frame.samplesPerChannel / frame.sampleRate) * 1000);
    }
    for (let i = 0; i < 30; i++) {
      stream.pushFrame(new AudioFrame(new Int16Array(800), 16000, 1, 800));
      await delay(50);
    }
    await receive;
    assert.match(transcript, /touch\s*screen/i);
  } finally {
    stream.close();
  }
  console.log(
    "PASS: Deepgram transcribed the synthetic spoken touchscreen report",
  );

  stage = "speech-to-Nebius-to-speech";
  const turn = new llm.ChatContext();
  turn.addMessage({
    role: "system",
    content:
      "You are an AI troubleshooting assistant. Ask one short question about whether the display is on.",
  });
  turn.addMessage({ role: "user", content: transcript });
  await speak(await reply(turn));
  console.log("PASS: transcribed speech → Nebius reply → synthesized audio");

  stage = "local voice activity detection";
  const vad = new inference.VAD().stream();
  try {
    assert.ok(vad._nativeVad, "Local Silero native runtime unavailable");
  } finally {
    vad.close();
  }
  console.log("PASS: local Silero voice activity detection loaded");
  console.log(
    "Provider checks passed. Live FaceTime media and greeting timing still need a test call.",
  );
} catch (error) {
  console.error(
    `FAIL: ${stage} (${error.name}${error.status ? `, HTTP ${error.status}` : ""}).`,
  );
  process.exitCode = 1;
} finally {
  await models?.stt.close();
  await models?.tts.close();
  clearTimeout(timeout);
}
