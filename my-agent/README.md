# Voice agent

LiveKit Agents worker with Nebius inference, Deepgram speech recognition, Cartesia
speech synthesis, and Chert FaceTime transport. Keep this process online during calls.

## Setup

Use Node 24 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, copy `.env.example`
to `.env.local`, and populate private credentials. Set `AGENT_NAME` to the same name
used by the outbound coordinator. Run `npm start`.

The start wrapper holds a macOS idle-sleep assertion while the worker runs; it
leaves system settings unchanged. Closing the lid or explicitly sleeping the
machine can still interrupt a call. Other platforms run the worker normally.

For inbound calls, use a separate terminal in this directory:

```sh
pnpm exec chert login
pnpm exec chert dev
```

Wait for the agent's waiting room before calling the line. Inbound Video can
provide frames; outbound calls from the consent page use audio only. Do not run an
inbound connector while testing outbound calls on the same shared line. Stop an
owned connector gracefully. After code changes, restart worker and connector once
no call is active. See `AGENTS.md` for Chert lifecycle rules.

## Modules and validation

`agent.mjs` owns lifecycle; `models.mjs` owns provider configuration;
`greet.mjs` owns bridge-ready opening; `voice-options.mjs` owns turn handling.
The `support/` directory keeps guide, interpreter, retrieval, and simulation modules
separate. Product-specific evidence and greeting are in `support/scenario.mjs`.
Changing that file alone does not create a new validated procedure.

`npm test` and `npm run check` are offline. `npm run simulate -- happy` exercises
synthetic workflow events. `npm run check:models`, `npm run check:voice`, and
`npm run check:keenable` make real provider requests but do not place calls.

See [configuration](../docs/configuration.md) and [current architecture](../docs/architecture.md).
