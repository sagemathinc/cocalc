#!/usr/bin/env node
// Minimal CLI for the project host. Delegates to the built JS entrypoint.
// Ensure you run `pnpm run build` first (or use the `app` script which does it).
(async () => {
  try {
    // Prefer the compiled output to avoid requiring a TS runtime.
    const { main } = require("../dist/main.js");
    await main();
  } catch (err) {
    console.error("project-host failed to start:", err);
    process.exitCode = 1;
  }
})();
