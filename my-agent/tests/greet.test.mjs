import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { greetOnBridgeReady, openingGate } from "../greet.mjs";

test("greeting waits for bridge-ready, fires once, and removes its listener", () => {
  const room = new EventEmitter();
  let greetings = 0;
  const stop = greetOnBridgeReady(room, () => greetings++);
  room.metadata = '{"chert_bridge_ready":false}';
  room.emit("roomMetadataChanged");
  assert.equal(greetings, 0);
  room.metadata = '{"chert_bridge_ready":true}';
  room.emit("roomMetadataChanged");
  room.emit("roomMetadataChanged");
  assert.equal(greetings, 1);
  assert.equal(room.listenerCount("roomMetadataChanged"), 0);
  stop();
});

test("an already-ready bridge greets immediately; shutdown cancels a pending greeting", () => {
  const room = new EventEmitter();
  room.metadata = '{"chert_bridge_ready":true}';
  let greetings = 0;
  greetOnBridgeReady(room, () => greetings++);
  assert.equal(greetings, 1);
  room.metadata = "";
  const stop = greetOnBridgeReady(room, () => greetings++);
  stop();
  room.metadata = '{"chert_bridge_ready":true}';
  room.emit("roomMetadataChanged");
  assert.equal(greetings, 1);
});

test("caller input stays gated through greeting playout and duplicate triggers do not speak twice", async () => {
  const enabled = [];
  let speakCount = 0,
    finish;
  const played = new Promise((resolve) => {
    finish = resolve;
  });
  const session = {
    input: { setAudioEnabled: (value) => enabled.push(value) },
    say() {
      speakCount++;
      return { waitForPlayout: () => played };
    },
  };
  const greet = openingGate(session, "Hello", { allowInterruptions: false });
  assert.deepEqual(enabled, [false]);
  const first = greet();
  await greet();
  assert.equal(speakCount, 1);
  assert.deepEqual(enabled, [false]);
  finish();
  await first;
  assert.deepEqual(enabled, [false, true]);
});
