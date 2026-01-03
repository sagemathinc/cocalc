#!/usr/bin/env node
// Minimal CLI for the project host. Delegates to the built JS entrypoint.
// Ensure you run `pnpm run build` first (or use the `app` script which does it).
(async () => {
  try {
    const args = process.argv.slice(2);
    if (args.includes("-h") || args.includes("--help")) {
      console.log(`Usage: cocalc-project-host [options] [daemon]

Options:
  -h, --help            Show this help
  -v, --version         Show version

Daemon:
  cocalc-project-host daemon start [index]
  cocalc-project-host daemon stop [index]
  cocalc-project-host --daemon [index]
  cocalc-project-host --daemon-start [index]
  cocalc-project-host --daemon-stop [index]

Notes:
  Reads /etc/cocalc/project-host.env if present.
`);
      return;
    }
    const { handleDaemonCli } = require("../dist/daemon.js");
    if (handleDaemonCli(args)) {
      return;
    }
    // Prefer the compiled output to avoid requiring a TS runtime.
    const { main } = require("../dist/main.js");
    await main();
  } catch (err) {
    console.error("project-host failed to start:", err);
    process.exitCode = 1;
  }
})();
