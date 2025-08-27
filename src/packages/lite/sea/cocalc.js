// cocalc.js
console.log("Starting CoCalc");

const VERSION = "v0.1";

const { getRawAsset } = require("node:sea");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Choose where to extract (version this if you’ll update assets)
const destDir = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
  "cocalc-lite",
  VERSION,
);

const stamp = path.join(destDir, ".ok");
if (!fs.existsSync(stamp)) {
  console.log("Unpacking...");
  // Read the SEA asset into a Buffer
  const ab = getRawAsset("cocalc-lite.tar.gz"); // ArrayBuffer (no copy)
  const buf = Buffer.from(new Uint8Array(ab)); // turn into Node Buffer

  fs.mkdirSync(destDir, { recursive: true });

  const child = spawnSync("tar", ["-xzf", "-", "-C", destDir], {
    input: buf,
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (child.error) {
    console.error("Failed to run tar:", r.error);
    process.exit(1);
  }
  if (child.status !== 0) {
    console.error(`tar exited with code ${r.status}`);
    process.exit(r.status);
  }

  console.log("Assets ready at:", destDir);
  fs.writeFileSync(stamp, "");
}

const Module = require("node:module");

const script = path.join(destDir, "cocalc-lite/lite/bin/start.js");

if (!fs.existsSync(script)) {
  console.error("missing start.js at", script);
  process.exit(1);
}

// set up argv and cwd as if launched directly
process.chdir(path.dirname(script));
process.argv = [process.execPath, script, ...process.argv.slice(2)];

// make sure PATH (and any other env) includes your extracted tools
process.env.PATH =
  path.join(destDir, "cocalc-lite/lite/bin") +
  path.delimiter +
  process.env.PATH;

// run like “node start.js”
Module.runMain(); // loads process.argv[1] as the main script
