# Support modules

The live agent uses `support-agent.mjs`, `turn-interpreter.mjs`, and
`voice-guide.mjs` for the prepared caller-confirmed touchscreen check.
`scenario.mjs` records the supported product and official manual sources.

`search-turn.mjs` handles automatic category queries on general-agent turns;
`parallel-search.mjs` runs priority official lookups and nonblocking background
context. `keenable.mjs` validates model-specific evidence and labels fallback.
`outcome-store.mjs` writes local state, not a retailer or hosted UI mutation.

The separate `controller.mjs` + `simulate.mjs` harness uses synthetic camera and
customer events. Run `npm run simulate -- happy` from `my-agent`; alternatives are
`unclear`, `still-broken`, `disconnect`, `return`, and `timeout`. Traces go to
ignored `.data/simulations/`. No network or paid model calls are made.

The simulator enforces ordering, freshness/versioning, deduplication, single-use
steps, and distinct gesture/customer confirmation. It does not validate real
observations or run the live voice conversation.
