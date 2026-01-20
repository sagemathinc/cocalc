#!/usr/bin/env node
// CoCalc Launchpad CLI entrypoint. Boots the Hub control plane in
// pglite + nextless mode with lightweight defaults.
const { dirname, join } = require("path");
const { existsSync } = require("fs");
const { applyLaunchpadDefaults, logLaunchpadConfig } = require("../lib/onprem-config");

function prependPath(dir) {
  if (!dir || !existsSync(dir)) {
    return;
  }
  process.env.PATH = `${dir}:${process.env.PATH ?? ""}`;
}

(async () => {
  try {
    applyLaunchpadDefaults();
    logLaunchpadConfig();

    const bundledRootCandidate = join(__dirname, "..", "..", "..");
    const bundleDir =
      process.env.COCALC_BUNDLE_DIR ??
      (existsSync(join(bundledRootCandidate, "pglite")) ||
      existsSync(join(bundledRootCandidate, "next-dist"))
        ? bundledRootCandidate
        : process.cwd());
    process.env.COCALC_BUNDLE_DIR ??= bundleDir;
    const pgliteBundleDir = join(bundleDir, "pglite");
    if (!process.env.COCALC_PGLITE_BUNDLE_DIR && existsSync(pgliteBundleDir)) {
      process.env.COCALC_PGLITE_BUNDLE_DIR = pgliteBundleDir;
    }
    const apiRoot = join(bundleDir, "next-dist", "pages", "api", "v2");
    if (!process.env.COCALC_API_V2_ROOT && existsSync(apiRoot)) {
      process.env.COCALC_API_V2_ROOT = apiRoot;
    }

    // put path to special node binaries if available
    prependPath(join(bundleDir, "node_modules", ".bin"));
    prependPath(join(bundleDir, "bundle", "node_modules", ".bin"));
    prependPath(join(process.cwd(), "node_modules", ".bin"));
    prependPath(dirname(process.execPath));

    if (!process.argv.includes("--all")) {
      process.argv.push("--all");
    }

    require("@cocalc/hub/hub");
  } catch (err) {
    console.error("cocalc-launchpad failed to start:", err);
    process.exitCode = 1;
  }
})();
