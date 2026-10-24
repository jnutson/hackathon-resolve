# Architecture

The return UI posts explicit consent and a request ID to a local server or the
hosted Cloudflare Worker. The hosted Durable Object serializes attempts, creates a
LiveKit room, dispatches the named agent, and asks Chert to place an outbound audio
call to the server-configured verified destination. The browser cannot select an
arbitrary phone number.

The coordinator polls Chert for a trusted `bridge_ready` event and writes room
metadata. `greet.mjs` gates the fixed greeting on that signal; caller arrival alone
does not prove FaceTime audio readiness. `agent.mjs` waits for a caller before
opening paid model sessions and publishes one audio track plus an animated face.

The voice path uses Deepgram transcription, Nebius inference, and Cartesia speech.
`turn-interpreter.mjs` maps natural replies into a small allowed set of intents.
`voice-guide.mjs` owns the reviewed step sequence and caller-reported outcome;
questions, ambiguity, and interpreter failure do not count as completed actions.
`support-agent.mjs` sends prepared guide replies directly or delegates other turns
to the general agent and search hook. This ordering means the guide can run from
prepared context without waiting for retrieval.

The search coordinator runs official manual and button lookups together. Separate
background searches discover conditions, firmware discussions, customer reports,
and escalation context. Model-root and host checks gate official documents;
background snippets remain hypotheses. Background completion never interrupts a
caller or generates speech. Results are scoped to the call and superseded queries
are cancelled. Failure can select the labeled prepared fallback.

`outcome-store.mjs` writes local state records under ignored `.data/`. It does not
write transcripts or phone numbers. These records are not forwarded to the hosted
status endpoint. The success screen is implemented, with explicit preview mode,
but live outcome-to-page delivery is still pending.

`controller.mjs` and `simulate.mjs` are a separate synthetic workflow harness with
ordering, freshness, duplicate-event, and evidence guards. They are not the active
voice guide and do not prove real camera observations.

The diagrams are editable architecture references. This document and the source
are authoritative for current implementation and limitations.
