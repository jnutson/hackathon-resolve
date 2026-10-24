// Makes real API requests. Optional serial is read from the environment, never saved.
import {
  createLookup,
  createClient,
  profiles,
  MODEL,
  isModelManual,
} from "./keenable.mjs";
const client = createClient();
const serial = process.env.TEST_GARMIN_SERIAL;
const cases = Object.entries(profiles).map(([id, query]) => ({
  id,
  query: `${MODEL} ${query}`,
  site: "www8.garmin.com",
}));
if (serial)
  cases.unshift(
    {
      id: "serial_exact",
      query: `Garmin model associated with serial number "${serial}"`,
    },
    {
      id: "serial_prefix",
      query: `Garmin model associated with serial number prefix "${serial.slice(0, 3)}"`,
      site: "garmin.com",
    },
  );
for (const c of cases) {
  const start = Date.now();
  try {
    const r = await client.search(c.query, {
      mode: "pro",
      site: c.site,
      snippetMaxLength: 1800,
    });
    console.log(
      JSON.stringify({
        id: c.id,
        elapsed_ms: Date.now() - start,
        count: r.results.length,
        model_manual_hits: r.results.filter((x) => isModelManual(x.url)).length,
        serial_literal_hits:
          c.id === "serial_exact"
            ? r.results.filter((x) =>
                `${x.title} ${x.snippet}`.includes(serial),
              ).length
            : undefined,
        // URLs/titles allow review without treating a rank or a serial mention as identification.
        top: r.results.slice(0, 3).map((x) => ({ title: x.title, url: x.url })),
      }),
    );
  } catch (e) {
    console.log(JSON.stringify({ id: c.id, status: "error", type: e.name }));
    process.exitCode = 1;
  }
}
for (let i = 0; i < 3; i++) {
  const result = await createLookup({ client })({
    topic: "touch",
    model: MODEL,
  });
  console.log(JSON.stringify({ id: `touch_end_to_end_${i + 1}`, ...result }));
  if (result.status !== "retrieved") process.exitCode = 1;
}
