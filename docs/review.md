# Reviewer checklist

1. Run both offline test suites and the Worker dry build from the root README.
2. Inspect `shared/config.mjs`: deployment IDs have no real defaults; hosted origin
   validation uses configuration and same-origin POST checks remain enforced.
3. Inspect call creation: consent, request deduplication, trusted destination,
   bridge readiness, bounded monitoring, and no automatic redial after uncertainty.
4. Inspect guide/interpreter tests: ambiguity must not advance a physical step;
   setting changes alone must not claim a successful swipe.
5. Inspect retrieval tests: source/model rejection, timeout, stale context, and
   script fallback are distinct from successful retrieval.
6. Run simulator alternatives (`still-broken`, `disconnect`, `timeout`).
7. Preview the resolved UI using `#resolved`; this is an explicit preview, not an
   outcome from a real call. Keep/return choices do not alter retailer state.

Optional network checks from `my-agent` after configuring `.env.local`:
`npm run check:keenable`, `npm run check:models`, and `npm run check:voice`.
These make real provider requests and may incur charges. They do not place a
FaceTime call. Real call delivery, interruption handling, and shared-line status
need a separate consented call and an available Chert line.
