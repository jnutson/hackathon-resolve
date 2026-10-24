# Configuration

Private agent configuration belongs in `my-agent/.env.local`. Hosted local secrets
belong in `hosted-agent/.dev.vars`. Copy the adjacent example files; neither real
file should be committed.

| Setting                                                | Used by                | Purpose                                                       |
| ------------------------------------------------------ | ---------------------- | ------------------------------------------------------------- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Agent and call servers | One LiveKit project for media, dispatch, speech inference     |
| `AGENT_NAME`                                           | Agent and call servers | Same explicitly registered dispatch name everywhere           |
| `NEBIUS_API_KEY`                                       | Agent                  | Language/vision and turn interpretation                       |
| `NEBIUS_MODEL`, `NEBIUS_BASE_URL`                      | Agent                  | Optional model and approved Nebius endpoint overrides         |
| `STT_MODEL`, `STT_LANGUAGE`, `TTS_MODEL`, `TTS_VOICE`  | Agent                  | Optional speech settings; defaults in example                 |
| `KEENABLE_API_KEY`                                     | Agent                  | Optional key for higher search limits                         |
| `CHERT_API_KEY`                                        | Call servers           | Chert calls API access                                        |
| `CHERT_PROJECT_ID`, `CHERT_LINE_ID`                    | Call servers           | Your project and assigned line; no fallback identifiers       |
| `CHERT_TEST_PHONE`                                     | Call servers           | Your verified destination in E.164 format                     |
| `PORT`                                                 | Local web server       | Defaults to 3000; loopback binding only                       |
| `PUBLIC_ORIGIN`                                        | Hosted Worker          | Exact deployed origin, including port for local development   |
| `DEMO_ATTEMPT_ID`                                      | Hosted Worker          | Durable Object namespace for one demo recipient/attempt group |

Set non-secret hosted values in `hosted-agent/wrangler.jsonc`. The template has no
Cloudflare account or custom domain. Wrangler selects the authenticated account;
its default deployment uses workers.dev. Set `PUBLIC_ORIGIN` to your actual origin
before serving calls. Without an origin, only loopback hosts are accepted.

Set the five hosted secrets with `npx wrangler secret put NAME` from hosted-agent:
`CHERT_API_KEY`, `CHERT_TEST_PHONE`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`. Never put model keys in the frontend or Worker unless needed.

Do not rotate `DEMO_ATTEMPT_ID` to bypass a call in progress or an uncertain result.
Confirm terminal provider status and room cleanup before intentionally preparing
another test. There is no public reset endpoint. A known busy-line rejection has a
bounded, explicit user retry path; unknown outcomes never automatically redial.
