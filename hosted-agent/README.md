# Hosted return UI and call coordinator

Cloudflare Worker + SQLite Durable Object. Routes stay under `/agent/`; static
assets live in `public/agent/`. The separate LiveKit worker in `../my-agent` must
be running for calls. This is a single-recipient demo.

## Local review

```sh
npm ci
npm test
npm run build
cp .dev.vars.example .dev.vars
npm run dev
```

`build` is a dry run. Open `http://localhost:8787/agent/`. Missing credentials keep
call creation unavailable. Populate `.dev.vars` only when testing actual calls.

## Deploy to your account

Set `PUBLIC_ORIGIN`, `CHERT_PROJECT_ID`, `CHERT_LINE_ID`, and `AGENT_NAME` in
`wrangler.jsonc`. The template uses workers.dev with no custom domain or account ID.
Use your exact deployed origin. Provision the five secrets listed in
[configuration](../docs/configuration.md) with `npx wrangler secret put NAME`, then
run `npm run deploy`. This changes infrastructure in your authenticated account.

POST `/agent/api/troubleshooting-call` requires consent, a UUID request ID, and
same origin. A Durable Object serializes attempts and uses a server-configured
verified phone number. Alarm polling signals bridge readiness and cleans up
terminal rooms. An unknown outcome requires operator review, not a second call.

Changing `DEMO_ATTEMPT_ID` creates a fresh namespace; do so only after verifying
that the previous call is terminal and its room is cleaned up. Deployments do not
reset call state. There is no public reset endpoint.

`public/agent/index.html` and `../my-agent/web/index.html` are the hosted and local
UI entry points. Keep UI edits in sync while preserving `/agent/` versus `/` API
and asset paths. The success view is available at `/agent/#resolved`; real outcome
propagation from the voice worker remains pending. UI choices do not submit returns.
