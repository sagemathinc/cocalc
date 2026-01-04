#!/usr/bin/env node
// CoCalc Launchpad CLI entrypoint. Boots the Hub control plane in
// pglite + nextless mode with lightweight defaults.
const { dirname, join } = require("path");
const { existsSync } = require("fs");

(async () => {
  try {
    process.env.COCALC_DB ??= "pglite";
    process.env.COCALC_DISABLE_NEXT ??= "1";
    process.env.COCALC_MODE ??= "launchpad";

    process.env.PORT ??= await require("@cocalc/backend/get-port").default();
    process.env.DATA ??= join(
      process.env.HOME ?? process.cwd(),
      ".local",
      "share",
      "cocalc-launchpad",
    );
    process.env.COCALC_PGLITE_DATA_DIR ??= join(
      process.env.DATA,
      "pglite",
    );

    const bundleDir = process.env.COCALC_BUNDLE_DIR ?? process.cwd();
    const pgliteBundleDir = join(bundleDir, "pglite");
    if (!process.env.COCALC_PGLITE_BUNDLE_DIR && existsSync(pgliteBundleDir)) {
      process.env.COCALC_PGLITE_BUNDLE_DIR = pgliteBundleDir;
    }
    const apiRoot = join(bundleDir, "next-dist", "pages", "api", "v2");
    if (!process.env.COCALC_API_V2_ROOT && existsSync(apiRoot)) {
      process.env.COCALC_API_V2_ROOT = apiRoot;
    }

    // put path to special node binaries:
    const { bin } = require("@cocalc/backend/data");
    process.env.PATH = `${bin}:${dirname(process.execPath)}:${process.env.PATH}`;

    if (!process.argv.includes("--all")) {
      process.argv.push("--all");
    }

    require("@cocalc/hub/hub");
  } catch (err) {
    console.error("cocalc-launchpad failed to start:", err);
    process.exitCode = 1;
  }
})();
