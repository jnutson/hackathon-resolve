// Prepared Forerunner 165 demo. Resolution always requires a caller-reported swipe test.
export function createVoiceGuide(onChange = () => {}) {
  let stage = "identify",
    last = "",
    misses = 0;
  const outcome = {
    status: "not_started",
    settingBefore: null,
    settingAfter: null,
    swipeVerified: false,
    preference: null,
  };
  const yes = (t) =>
    /\b(yes|yeah|yep|done|ready|there|opened|open|see it|got it|okay|ok|sure)\b/i.test(
      t,
    );
  const negative = (t) =>
    /\b(no|nope|not|isn't|doesn't|can't|cannot|didn't)\b/i.test(t);
  const emit = () => onChange({ stage, ...outcome });
  const say = (next, text) => {
    stage = next;
    last = text;
    misses = 0;
    emit();
    return text;
  };
  const unresolved = () => {
    outcome.status = "unresolved";
    return say(
      "choice",
      "That has not fixed the touchscreen. Would you like Garmin support or to continue your return?",
    );
  };
  const menu =
    "Hold the middle button on the left to open the settings menu. Tell me when it opens.";
  const system =
    "Use the middle and bottom left buttons to highlight System, then press the top right button to select it. Tell me when you’re in System.";
  const touch =
    "Select Touch using the left buttons to move and the top right button to select. Is touch for general use on or off?";
  const enable =
    "Select the general-use touch option with the top right button. Use the left buttons to choose on, then the top right button to confirm. Does it now show on?";
  const swipe =
    "Press the bottom right button until you’re back at the watch face, then swipe the screen without pressing a button. Did that work?";
  const clarify = () => {
    misses++;
    return misses >= 2
      ? "We can pause here or continue your return. What would you prefer?"
      : "Read me one or two labels on the screen so I can guide you from there.";
  };
  return {
    get stage() {
      return stage;
    },
    get prompt() {
      return last;
    },
    get outcome() {
      return { stage, ...outcome };
    },
    finish() {
      if (outcome.status === "in_progress") outcome.status = "unconfirmed";
      emit();
      return this.outcome;
    },
    observe(text) {
      const t = text.trim();
      if (!t) return null;
      if (
        /\b(stop|end the call|just return|continue (?:my |the )?return)\b/i.test(
          t,
        )
      ) {
        outcome.preference = "return";
        if (outcome.status === "in_progress") outcome.status = "unconfirmed";
        return say(
          "done",
          "Understood. You’d like to continue your return. No retailer return has been changed.",
        );
      }
      if (stage === "done")
        return "Your troubleshooting result is captured. No retailer return has been changed. Thanks for trying Resolve.";
      if (/\b(wait|hold on|one second|hang on)\b/i.test(t))
        return "Take your time.";
      if (
        /repeat|say that again|which button|what button|letter|you mean|what did you say/i.test(
          t,
        )
      )
        return last || menu;
      // Exit the narrow demo if the user supplies a contrary model, lock, or activity.
      if (
        /\b(padlock|swimming|swim activity|different (?:watch|model))\b/i.test(
          t,
        ) &&
        !/\b(no|not|isn't)\b/i.test(t)
      ) {
        outcome.status = "unresolved";
        return say(
          "choice",
          "This setting check may not apply to that screen or activity. Would you prefer Garmin support or to continue your return?",
        );
      }
      if (stage === "identify") {
        if (!/touch\s*screen|\btouch\b|\bswip(?:e|ing)\b/i.test(t)) return null;
        outcome.status = "in_progress";
        return say(
          "brightness",
          "Is the watch on and bright, or is the face dim?",
        );
      }
      if (stage === "brightness") {
        if (
          /\b(dim|dark|off|black|blank)\b/i.test(t) &&
          !/not dim|isn't dim/i.test(t)
        )
          return "Press the top left button to wake the display. Is the watch face now on and bright?";
        if (
          /\b(bright|lit)\b|fully on|screen is on|watch is on/i.test(t) ||
          yes(t)
        )
          return say(
            "menu",
            "Maybe the touchscreen is turned off. Let’s check that setting. " +
              menu,
          );
        return "Is the display on and bright, or dim?";
      }
      if (stage === "anything_else") {
        if (negative(t) || /all|thanks|thank you/i.test(t))
          return say(
            "choice",
            "Would you like to keep the watch or continue your return?",
          );
        if (/\bkeep\b/i.test(t)) {
          outcome.preference = "keep";
          return say(
            "done",
            "Your touchscreen resolution and preference to keep the watch are captured. Thanks for trying Resolve.",
          );
        }
        return say("additional_issue", "What else can I help with?");
      }
      if (stage === "additional_issue") return null; // Keep the confirmed touch outcome while handling a separate question.
      if (stage === "choice") {
        if (/keep|return|support/i.test(t)) {
          outcome.preference = /keep/i.test(t)
            ? "keep"
            : /return/i.test(t)
              ? "return"
              : "garmin_support";
          return say(
            "done",
            outcome.status === "resolved"
              ? "Great. Touch is working after enabling it, and your preference is captured. No retailer return has been changed."
              : "Your preference is captured. The touchscreen issue is still unresolved, and no retailer return has been changed.",
          );
        }
        return outcome.status === "resolved"
          ? "Would you like to keep the watch or continue your return?"
          : "Would you prefer Garmin support or to continue your return?";
      }
      if (stage === "swipe") {
        if (negative(t) || /still|nothing|broken/i.test(t)) return unresolved();
        if (yes(t) || /works|working|changed|moves|scroll/i.test(t)) {
          outcome.swipeVerified = true;
          outcome.status = "resolved";
          return say(
            "anything_else",
            "Great, you’ve confirmed the touchscreen works after turning touch on. Anything else I can help you with today?",
          );
        }
        return "Does swiping change the screen now, without using a button?";
      }
      if (stage === "enable") {
        if (negative(t)) return clarify();
        if (/\b(on|enabled)\b/i.test(t) || yes(t)) {
          outcome.settingAfter = "on";
          return say("swipe", swipe);
        }
        return "Does the general-use touch setting now show on?";
      }
      if (
        /can't|cannot|don't see|do not see|nothing|not working|didn't|did not/i.test(
          t,
        )
      )
        return clarify();
      // Recognize an explicit setting immediately; don't ask the same question again.
      if (["touch", "setting"].includes(stage)) {
        if (/\b(off|disabled)\b/i.test(t)) {
          outcome.settingBefore = "off";
          return say("enable", enable);
        }
        if (/\b(on|enabled)\b/i.test(t)) {
          outcome.settingBefore = "on";
          return unresolved();
        }
        if (/general|use|activity|sleep/i.test(t) || yes(t))
          return say(
            "setting",
            "Select General Use with the top right button. Does it show on or off?",
          );
        return clarify();
      }
      if (stage === "menu") {
        if (
          /\b(in|inside|opened)\b.{0,15}\bsystem\b|system (?:is )?open/i.test(t)
        )
          return say("touch", touch);
        // A menu may show activities, appearance or controls rather than the word menu.
        if (
          yes(t) ||
          /menu|settings|system|activities|apps|appearance|watch face|history|sensors|controls|music/i.test(
            t,
          )
        )
          return say("system", system);
        return clarify();
      }
      if (stage === "system") {
        if (
          yes(t) ||
          /system|touch|language|time|display|sound|vibration/i.test(t)
        )
          return say("touch", touch);
        return clarify();
      }
      return null;
    },
  };
}
