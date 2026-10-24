// Use Deepgram's end-of-speech signal instead of another remote turn model.
// Require actual transcribed words before background sound can interrupt speech.
export const turnHandling = {
  turnDetection: "stt",
  preemptiveGeneration: { enabled: false },
  endpointing: { minDelay: 500, maxDelay: 3000 },
  interruption: {
    mode: "vad",
    minDuration: 700,
    minWords: 2,
    falseInterruptionTimeout: 1500,
    resumeFalseInterruption: true,
  },
};
export const greetingOptions = { allowInterruptions: false };
