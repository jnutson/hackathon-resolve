# Resolve

A working hackathon demo of AI-assisted product troubleshooting before a return.
The customer requests a FaceTime call, explains the problem, and receives guided
support for a Garmin Forerunner 165 touchscreen setting. The demo keeps the
customer's option to return the product.

**[Watch or download the demo](https://github.com/jnutson/hackathon-resolve/releases/tag/demo-v1)**

## Repository map

| Path                                              | Responsibility                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `hosted-agent/`                                   | Cloudflare Worker, Durable Object call coordinator, hosted return UI |
| `my-agent/agent.mjs`                              | LiveKit worker entry point and call lifecycle                        |
| `my-agent/models.mjs`                             | Nebius language model, Deepgram STT, Cartesia TTS                    |
| `my-agent/support/support-agent.mjs`              | LiveKit turn hook and guided reply integration                       |
| `my-agent/support/voice-guide.mjs`                | Prepared touchscreen procedure and caller-reported outcome           |
| `my-agent/support/turn-interpreter.mjs`           | Classifies caller replies into bounded procedure events              |
| `my-agent/support/parallel-search.mjs`            | Priority official documentation plus background context              |
| `my-agent/support/keenable.mjs`                   | Model-scoped source validation and retrieval fallback                |
| `my-agent/support/scenario.mjs`                   | Reviewed product, procedure ID, manual URLs, and greeting            |
| `my-agent/support/controller.mjs`                 | Separate deterministic simulator controller                          |
| `my-agent/web/`                                   | Local consent UI and outbound API alternative                        |
| `shared/config.mjs`                               | Required deployment configuration and origin validation              |
| `my-agent/tests/`, `hosted-agent/worker.test.mjs` | Offline regression tests                                             |
| `diagrams/`                                       | Editable architecture diagram and rendered copies                    |

## Review without credentials

Use Node 24 and pnpm 11.25.0. No account or phone call is needed for unit tests.

```sh
pnpm --dir my-agent install --frozen-lockfile
npm ci --prefix hosted-agent
npm test --prefix my-agent
npm test --prefix hosted-agent
npm run check --prefix my-agent
npm run build --prefix hosted-agent
```

The Worker build is a local dry run, not a deployment. To explore the deterministic
workflow with synthetic observations:

```sh
cd my-agent
npm run simulate -- happy
# Also: unclear, still-broken, disconnect, return, timeout
```

## Run the demo

1. Copy `my-agent/.env.example` to `my-agent/.env.local` and fill in your credentials.
   All LiveKit credentials must belong to the same project. Use a unique
   `AGENT_NAME`, matching the name configured in the call coordinator.
2. From `my-agent`, run `npm start` to register the voice worker.
3. For the local outbound UI, configure the Chert fields and verified destination
   in `.env.local`, run `npm run web`, then open `http://localhost:3000`.
4. For hosted infrastructure, follow [hosted-agent/README.md](hosted-agent/README.md).
   For inbound FaceTime, follow [my-agent/README.md](my-agent/README.md).

A real call requires provisioned LiveKit, Nebius, and Chert access plus an available
FaceTime line. Voice/provider checks can incur usage charges; they are separate
from offline tests. Never run an outbound call while your inbound Chert connector
holds the same line.

## Scope and honest limitations

- The reviewed repair scenario is **Forerunner 165 general-use touch disabled**.
  Its source URLs and procedure are deliberate fixtures, not environment settings.
  Changing only the model name does not add support for another device.
- The live voice guide interprets replies and walks the prepared procedure. It
  records caller-reported success after a swipe test; it does not certify visual
  or hardware repair. The separate simulator's synthetic evidence is not live vision.
- Keenable can retrieve official instructions and background context. The prepared
  voice-guide path takes precedence; search runs on turns handed to the general
  agent. Retrieval failure preserves the narrow scripted fallback. Search results
  are not proof of a diagnosis, frequency, firmware version, or serial identity.
- Outbound calls currently use audio only. Inbound FaceTime Video may provide
  camera frames. No retailer return is submitted or cancelled.
- The resolved UI can be previewed with `/#resolved` locally or `/agent/#resolved`
  when hosted. The local outcome audit is **not yet connected to hosted UI status**;
  a call ending alone never shows success.
- Call state is single-recipient demo infrastructure, not multi-tenant production
  infrastructure. Unknown call outcomes require operator reconciliation.

See [architecture and data flow](docs/architecture.md), [configuration](docs/configuration.md),
and [review checklist](docs/review.md). Secrets, runtime state, recordings, and local
logs are ignored. The edited demo video is a release asset rather than a Git blob.
