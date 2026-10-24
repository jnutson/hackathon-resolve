import { GarminSession } from "./controller.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const scenario = process.argv[2] ?? "happy";
if (
  ![
    "happy",
    "unclear",
    "still-broken",
    "disconnect",
    "return",
    "timeout",
  ].includes(scenario)
)
  throw Error("Unknown scenario");
let clock = Date.now();
const session = new GarminSession({ now: () => clock });
function send(type, fields = {}) {
  clock += 3000;
  const result = session.dispatch({
    id: randomUUID(),
    type,
    version: session.version,
    ...fields,
  });
  console.log(`${result.state}: ${result.instruction ?? ""}`);
  return result;
}
function observe(fields) {
  return send("observe", {
    captured_at: clock + 3000,
    screen: "watch_face",
    display_on: true,
    gesture: "none",
    changed: false,
    button_pressed: false,
    touch_enabled: null,
    ...fields,
  });
}
console.log(
  `SIMULATION — scripted customer, cached documentation, synthetic camera evidence (${scenario})`,
);
send("identify", { model: "Garmin Forerunner 165" });

if (scenario === "disconnect") send("disconnect");
else if (scenario === "timeout") {
  clock += 120000;
  send("tick");
} else if (scenario === "unclear") {
  for (let i = 0; i < 4; i++) observe({ screen: "unclear" });
} else {
  observe({ gesture: "swipe" });
  send("documentation", {
    mode: "cached",
    procedure_id: "garmin-165-enable-touch-v1",
  });
  for (const screen of ["settings", "system", "touch"]) observe({ screen });
  observe({ screen: "general_use", touch_enabled: false });
  observe({ screen: "touch_on", touch_enabled: true });
  observe({ screen: "watch_face" });
  observe({
    screen: scenario === "still-broken" ? "watch_face" : "glances",
    gesture: "swipe",
    changed: scenario !== "still-broken",
  });
  if (scenario !== "still-broken") send("confirm", { answer: "yes" });
  send("choice", {
    value: scenario === "return" ? "continue_return" : "keep",
    source: "page",
  });
}
const directory = new URL("../.data/simulations/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL(`${session.id}.json`, directory),
  JSON.stringify({ ...session.view(), events: session.events }, null, 2),
);
console.log(JSON.stringify(session.view(), null, 2));
