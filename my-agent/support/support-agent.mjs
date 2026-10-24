import { voice } from "@livekit/agents";
import { createSearchTurn } from "./search-turn.mjs";
export class SupportAgent extends voice.Agent {
  constructor(options, search, guide, interpret) {
    super(options);
    this.searchTurn = createSearchTurn(search);
    this.guide = guide;
    this.interpret = interpret;
  }
  async onUserTurnCompleted(chatCtx, message) {
    const text = message.textContent || "";
    const stage = this.guide.stage;
    const interpretation = this.interpret
      ? await this.interpret({ stage, text, previousPrompt: this.guide.prompt })
      : null;
    if (
      interpretation &&
      ["unclear", "question", "unavailable"].includes(interpretation.intent)
    ) {
      // No state transition for questions, ambiguity, or interpreter failure.
      this.nextGuideStep =
        interpretation.intent === "question"
          ? this.explainStep(stage)
          : stage === "identify"
            ? "What happens when you try to use the watch?"
            : "Just to check: " +
              (this.guide.prompt || "What do you see on the watch?");
      return;
    }
    if (
      interpretation?.intent === "other_problem" ||
      stage === "additional_issue"
    ) {
      this.nextGuideStep = null;
      await this.searchTurn(chatCtx, message);
      return;
    }
    if (interpretation?.intent === "another_issue") {
      this.nextGuideStep = this.guide.observe("Yes, something else");
      return;
    }
    this.nextGuideStep = this.guide.observe(interpretation?.text ?? text);
    if (!this.nextGuideStep) await this.searchTurn(chatCtx, message);
  }
  explainStep(stage) {
    const explanations = {
      brightness:
        "I’m checking that the display is awake before we check its touch setting.",
      menu: "Touch can be switched off independently of the physical buttons. We’re checking that setting, without resetting your watch.",
      system:
        "The middle and bottom left buttons move through menu items. The top right button selects the highlighted item.",
      touch:
        "General Use controls touch outside an activity. We only need to check that option.",
      setting:
        "We’re checking the current value, so we know whether touch was disabled.",
      enable:
        "This enables touch for general use; it does not erase your data.",
      swipe:
        "Changing the setting alone does not prove it worked. Swiping without a button tests the touchscreen.",
    };
    return (
      (explanations[stage] ||
        "Let’s focus on what happens when you use the watch.") +
      " " +
      (this.guide.prompt || "What is happening with it?")
    );
  }

  async llmNode(chatCtx, toolCtx, settings) {
    if (!this.nextGuideStep) return super.llmNode(chatCtx, toolCtx, settings);
    const text = this.nextGuideStep;
    this.nextGuideStep = null;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      },
    });
  }
}
