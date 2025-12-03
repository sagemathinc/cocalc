/*
This is run when starting the SEA executable.
This template is shared by other bundles; keep it generic and rely on
envsubst to provide NAME, VERSION, and MAIN.
*/

const path = require("node:path");
const fs = require("node:fs");
const repl = require("node:repl");
const os = require("node:os");

// DO NOT use ${} in this file; envsubst fills NAME/VERSION/MAIN.
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
    const ab = getRawAsset("cocalc.tar.xz");
    const buf = Buffer.from(new Uint8Array(ab));

    fs.mkdirSync(destDir, { recursive: true });

    const child = spawnSync(
      "tar",
      ["-Jxf", "-", "-C", destDir, "--strip-components=1"],
      { input: buf, stdio: ["pipe", "inherit", "inherit"] },
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
    r.setupHistory(historyFile, (err) => {
      if (err) console.error("REPL history error:", err);
    });
    return;
  }

  process.argv = [process.execPath, ...process.argv.slice(2)];
} else if (process.argv[2] == "-v" || process.argv[2] == "--version") {
  console.log(version);
  process.exit(0);
} else {
  const destDir = extractAssetsSync();
  console.log("CoCalc Project Host (v" + version + ")");

  const script = path.join(destDir, mainScript);

  if (!fs.existsSync(script)) {
    console.error(`missing ${mainScript} at`, script);
    process.exit(1);
  }

  process.chdir(path.dirname(script));
  process.argv = [process.execPath, script, ...process.argv.slice(2)];

  process.env.PATH =
    path.join(destDir, `src/packages/${name}/bin/`) +
    path.delimiter +
    process.env.PATH;

  process.env.AUTH_TOKEN ??= "random";
}

Module.runMain();
