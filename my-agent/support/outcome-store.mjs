import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
// Local demo audit. Contains state and caller-confirmed outcome, not transcripts or phone numbers.
export function createOutcomeStore(
  room,
  directory = new URL("../.data/", import.meta.url),
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path =
    directory instanceof URL
      ? new URL("call-outcomes.jsonl", directory)
      : join(directory, "call-outcomes.jsonl");
  return (state) =>
    appendFileSync(
      path,
      JSON.stringify({ at: new Date().toISOString(), room, ...state }) + "\n",
      { mode: 0o600 },
    );
}
