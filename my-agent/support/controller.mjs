import { MODEL, PROCEDURE_ID } from "./scenario.mjs";
import { randomUUID } from "node:crypto";

// Transport-independent controller. Only adapters supply evidence; dialogue cannot
// select a state or write an outcome directly.
export class GarminSession {
  constructor({ now = Date.now, mode = "simulation" } = {}) {
    this.now = now;
    this.mode = mode;
    this.id = randomUUID();
    this.started = now();
    this.state = "IDENTIFY_DEVICE";
    this.version = 0;
    this.events = [];
    this.observations = [];
    this.steps = [];
    this.seen = new Set();
    this.unclear = 0;
    this.record = null;
    this.choice = "undecided";
  }
  view() {
    return {
      session_id: this.id,
      mode: this.mode,
      state: this.state,
      version: this.version,
      instruction: this.instruction ?? null,
      resolution: this.record,
      choice: this.choice,
    };
  }
  finish(reason, resolved = false) {
    this.record = {
      schema_version: "1",
      resolution_id: this.id,
      session_id: this.id,
      mode: this.mode,
      procedure_id: PROCEDURE_ID,
      diagnosis_code: this.diagnosis ?? null,
      device: this.device ?? null,
      reported_problem: "Touchscreen does not respond",
      outcome: resolved ? "resolved" : "unverified",
      exit_reason: reason,
      source_ids: this.source ? [this.source.id] : [],
      retrieval_mode: this.source?.mode ?? "unavailable",
      attempted_steps: structuredClone(this.steps),
      verification: {
        visual: resolved ? "passed" : "inconclusive",
        observation_ids: resolved
          ? this.observations.slice(-2).map((o) => o.id)
          : [],
        customer_confirmation: resolved ? "yes" : "unknown",
      },
      completed_at: new Date(this.now()).toISOString(),
    };
    this.state = "CAPTURE_RETURN_CHOICE";
    this.instruction =
      "Would you like to keep the watch or continue your return?";
  }
  dispatch(event) {
    const allowed = {
      identify: ["model"],
      documentation: ["id", "mode", "procedure_id"],
      observe: [
        "captured_at",
        "screen",
        "display_on",
        "gesture",
        "changed",
        "button_pressed",
        "touch_enabled",
      ],
      confirm: ["answer"],
      choice: ["value", "source"],
      stop: [],
      disconnect: [],
      tick: [],
    };
    if (!event || !allowed[event.type] || typeof event.id !== "string")
      throw Error("Invalid event");
    if (
      Object.keys(event).some(
        (k) => !["id", "type", "version", ...allowed[event.type]].includes(k),
      )
    )
      throw Error("Unknown field");
    if (this.seen.has(event.id)) return this.view();
    if (event.version !== this.version) throw Error("Stale state version");
    if (this.state === "COMPLETE") throw Error("Session complete");
    const terminal = this.record !== null;
    if (
      !terminal &&
      (this.now() - this.started >= 120000 ||
        ["stop", "disconnect"].includes(event.type))
    ) {
      this.finish(
        event.type === "tick" || !["stop", "disconnect"].includes(event.type)
          ? "time_limit"
          : event.type === "stop"
            ? "customer_stopped"
            : "disconnected",
      );
    } else if (event.type === "tick") {
      // The runner supplies clock ticks even when the caller is silent.
    } else if (this.state === "IDENTIFY_DEVICE" && event.type === "identify") {
      if (typeof event.model !== "string") throw Error("Model required");
      this.device = event.model;
      if (event.model !== MODEL) this.finish("unsupported_device");
      else {
        this.state = "INSPECT_DEVICE";
        this.instruction =
          "Show me the lit watch screen and try a swipe without pressing any buttons.";
      }
    } else if (
      this.state === "LOAD_DOCUMENTATION" &&
      event.type === "documentation"
    ) {
      if (
        !["live", "cached"].includes(event.mode) ||
        event.procedure_id !== PROCEDURE_ID
      )
        throw Error("Unsupported documentation");
      this.source = { id: event.id, mode: event.mode };
      this.state = "INSPECT_DEVICE";
      this.issue(
        "open_settings",
        "Hold UP to open the menu, then show me the screen.",
      );
    } else if (this.state === "INSPECT_DEVICE" && event.type === "observe") {
      if (
        !Number.isFinite(event.captured_at) ||
        event.captured_at > this.now() ||
        this.now() - event.captured_at > 10000 ||
        event.captured_at <= (this.steps.at(-1)?.issued_at ?? -Infinity)
      )
        throw Error("Stale or invalid observation");
      if (
        ![
          "unclear",
          "watch_face",
          "settings",
          "system",
          "touch",
          "general_use",
          "touch_on",
          "glances",
          "other",
        ].includes(event.screen) ||
        typeof event.display_on !== "boolean" ||
        !["none", "swipe"].includes(event.gesture) ||
        typeof event.changed !== "boolean" ||
        typeof event.button_pressed !== "boolean" ||
        ![true, false, null].includes(event.touch_enabled)
      )
        throw Error("Invalid observation schema");
      if (
        event.captured_at <=
        (this.observations.at(-1)?.captured_at ?? -Infinity)
      )
        throw Error("Out-of-order observation");
      this.observations.push({ ...event });
      this.events.push({ stage: "DIAGNOSE_PROBLEM", observation_id: event.id });
      if (event.screen === "unclear") {
        if (++this.unclear >= 4) this.finish("attempt_limit");
        else this.instruction = "Bring the watch closer and hold it steady.";
      } else if (!event.display_on || event.screen === "other")
        this.finish("unsupported_problem");
      else if (!this.source) {
        if (
          event.screen === "watch_face" &&
          event.gesture === "swipe" &&
          !event.changed &&
          !event.button_pressed
        ) {
          this.state = "LOAD_DOCUMENTATION";
          this.instruction =
            "The display is on, but that swipe did not move the screen. Let me check the touch settings instructions.";
        } else
          this.instruction =
            "Show me a swipe on the watch face without pressing a button.";
      } else if (this.steps.at(-1)?.step_id === "test_swipe") {
        if (
          event.gesture === "swipe" &&
          event.changed &&
          !event.button_pressed &&
          event.screen === "glances"
        ) {
          this.state = "VERIFY_RESOLUTION";
          this.instruction =
            "I saw the swipe move the screen. Is touch working for you now?";
        } else if (
          event.gesture === "swipe" &&
          !event.changed &&
          !event.button_pressed
        ) {
          this.finish("touch_still_unresponsive");
          this.record.outcome = "unresolved";
        } else
          this.instruction =
            "Swipe up or down without pressing any buttons, and keep your finger and screen visible.";
      } else {
        const path = {
          open_settings: [
            "settings",
            "select_system",
            "Use UP or DOWN to highlight System. Show me when it is highlighted, then select it with START.",
          ],
          select_system: [
            "system",
            "select_touch",
            "Use UP or DOWN to highlight Touch, then select it with START.",
          ],
          select_touch: [
            "touch",
            "select_general_use",
            "Use the buttons to select the option for general watch use; show me its current setting.",
          ],
          select_general_use: [
            "general_use",
            "enable_touch",
            "Touch is disabled for general use. Use the buttons to choose the enabled option and confirm with START.",
          ],
          enable_touch: [
            "touch_on",
            "return_to_face",
            "Use BACK to return to the watch face, then show me.",
          ],
          return_to_face: [
            "watch_face",
            "test_swipe",
            "Without pressing a button, swipe up or down and keep your finger and screen visible.",
          ],
        };
        const next = path[this.steps.at(-1)?.step_id];
        if (!next || event.screen !== next[0])
          this.instruction =
            "Show me the current menu clearly before we continue.";
        else if (next[1] === "enable_touch" && event.touch_enabled !== false)
          this.finish("setting_not_disabled");
        else if (next[1] === "return_to_face" && event.touch_enabled !== true)
          this.instruction = "Show me whether touch is now enabled.";
        else {
          if (next[1] === "enable_touch")
            this.diagnosis = "GENERAL_USE_TOUCH_DISABLED";
          this.issue(next[1], next[2]);
        }
      }
    } else if (this.state === "VERIFY_RESOLUTION" && event.type === "confirm") {
      if (!["yes", "no", "unknown"].includes(event.answer))
        throw Error("Invalid confirmation");
      this.finish(
        event.answer === "yes" ? "verified_fix" : "unsupported_problem",
        event.answer === "yes",
      );
      this.record.verification.customer_confirmation = event.answer;
      this.record.verification.confirmation_event_id = event.id;
      if (event.answer === "no") this.record.outcome = "unresolved";
    } else if (
      this.state === "CAPTURE_RETURN_CHOICE" &&
      event.type === "choice"
    ) {
      if (
        !["keep", "continue_return"].includes(event.value) ||
        !["voice", "page"].includes(event.source)
      )
        throw Error("Invalid choice");
      if (event.source === "voice")
        this.instruction = "Confirm your choice on the return page.";
      else {
        this.choice = event.value;
        this.state = "COMPLETE";
        this.instruction =
          event.value === "keep"
            ? "Demo return draft closed."
            : "Return review ready; submission is still required.";
      }
    } else throw Error(`Event ${event.type} not permitted in ${this.state}`);
    this.seen.add(event.id);
    this.version++;
    this.events.push(structuredClone(event));
    return this.view();
  }
  issue(step_id, text) {
    if (
      this.steps.some((s) => s.step_id === step_id) ||
      this.steps.length >= 7
    ) {
      this.finish("attempt_limit");
      return;
    }
    this.steps.push({
      instruction_id: randomUUID(),
      step_id,
      issued_at: this.now(),
    });
    this.events.push({ stage: "GUIDE_STEP", step_id });
    this.instruction = text;
  }
}
