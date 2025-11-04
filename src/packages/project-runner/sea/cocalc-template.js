/*
This is run when starting the SEA executable.
This same template is used both here *AND* for the packages/lite/sea,
so if you change this you have to do so in a way that is sufficiently
generic.  That's why name and mainScript are set via a template.
*/

const path = require("node:path");
const fs = require("node:fs");
const repl = require("node:repl");
const os = require("node:os");

// DO NOT use dollar{} anywhere in this file, because it is processed
// using envsubst!
const version = "${VERSION}";
const name = "${NAME}";
const mainScript = "${MAIN}";

function extractAssetsSync() {
  const { getRawAsset } = require("node:sea");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");

  const destDir = path.join(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
    "cocalc",
    name,
    version,
  );

  const stamp = path.join(destDir, ".ok");
  if (!fs.existsSync(stamp)) {
    console.log("Unpacking...");
    // Read the SEA asset into a Buffer
    const ab = getRawAsset("cocalc.tar.xz"); // ArrayBuffer (no copy)
    const buf = Buffer.from(new Uint8Array(ab)); // turn into Node Buffer

    fs.mkdirSync(destDir, { recursive: true });

    const child = spawnSync(
      "tar",
      ["-Jxf", "-", "-C", destDir, "--strip-components=1"],
      {
        input: buf,
        stdio: ["pipe", "inherit", "inherit"],
      },
    );

    if (child.error) {
      console.error("Failed to run tar:", child.error);
      process.exit(1);
    }
    if (child.status !== 0) {
      console.error("tar exited with code", child.status);
      process.exit(child.status);
    }

    console.log("Assets ready at:", destDir);
    fs.writeFileSync(stamp, "");
  }
  return destDir;
}

const Module = require("node:module");

if (path.basename(process.argv[1]) == "node") {
  // Emulate `node` with no script: start a REPL.
  const noUserScript =
    process.argv.length === 2 ||
    (process.argv.length === 3 &&
      (process.argv[2] === "-i" || process.argv[2] === "--interactive"));

  if (noUserScript) {
    const historyFile = path.join(os.homedir(), ".node_repl_history");
    const r = repl.start({
      prompt: "> ",
      useGlobal: true,
      ignoreUndefined: false,
    });
    // Persist history like the real CLI
    r.setupHistory(historyFile, (err) => {
      if (err) console.error("REPL history error:", err);
    });
    // Do NOT call Module.runMain() here.
    return;
  }

  process.argv = [process.execPath, ...process.argv.slice(2)];
} else if (process.argv[2] == "-v" || process.argv[2] == "--version") {
  console.log(version);
  process.exit(0);
} else {
  const destDir = extractAssetsSync();
  console.log("CoCalc Project Runner (v" + version + ")");

  const script = path.join(destDir, mainScript);

  if (!fs.existsSync(script)) {
    console.error(`missing ${mainScript} at`, script);
    process.exit(1);
  }

  // set up argv and cwd as if launched directly
  process.chdir(path.dirname(script));
  process.argv = [process.execPath, script, ...process.argv.slice(2)];

  // make sure PATH (and any other env) includes your extracted tools
  process.env.PATH =
    path.join(destDir, `src/packages/${name}/bin/`) +
    path.delimiter +
    process.env.PATH;

  process.env.AUTH_TOKEN ??= "random";
}

Module.runMain();
