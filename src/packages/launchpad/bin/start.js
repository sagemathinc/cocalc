#!/usr/bin/env node
// CoCalc Launchpad CLI entrypoint. Boots the Hub control plane in
// pglite + nextless mode with lightweight defaults.
const { dirname, join } = require("path");
const { existsSync } = require("fs");
const { createServer } = require("http");

async function getPort() {
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Failed to get port"));
      }
    });
    server.on("error", reject);
  });
  return port;
}

function prependPath(dir) {
  if (!dir || !existsSync(dir)) {
    return;
  }
  process.env.PATH = `${dir}:${process.env.PATH ?? ""}`;
}

(async () => {
  try {
    process.env.COCALC_DB ??= "pglite";
    process.env.COCALC_DISABLE_NEXT ??= "1";
    process.env.COCALC_MODE ??= "launchpad";

    process.env.PORT ??= await getPort();
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
