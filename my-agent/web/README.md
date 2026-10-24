# Local return UI

From `my-agent`, configure `.env.local`, run `npm start` in one terminal and
`npm run web` in another. Open `http://localhost:3000`. The server binds loopback
only and requires matching request origin, explicit consent, and a fresh UUID.

Required outbound configuration: LiveKit credentials, `AGENT_NAME`, `CHERT_API_KEY`,
`CHERT_PROJECT_ID`, `CHERT_LINE_ID`, and a verified `CHERT_TEST_PHONE`. No assigned
project or line is embedded in source. Missing values disable calls.

The server records one attempt in ignored `.data/outbound-attempt.json`. After an
uncertain call request, reconcile provider state before any retry. Archive local
state only after confirmed terminal status and room cleanup. Never run an inbound
connector on the same shared line during outbound tests.

`/#resolved` previews the success screen. Call-ended status is not a repair result.
A future status adapter may supply `resolution.status = resolved` and
`resolution.customerConfirmed = true`; the current server does not publish that
record. Keep/return buttons are demo choices without retailer integration.
