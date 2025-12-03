#!/usr/bin/env node
// Stop the daemon started by daemon-start.js

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexArg = process.argv[2];
const index = indexArg === undefined ? 0 : Number(indexArg);
if (!Number.isInteger(index) || index < 0) {
  console.error(
    `Invalid instance index "${indexArg}". Provide a non-negative integer (e.g., 0, 1, 2).`,
  );
  process.exit(1);
}
const pidPath = path.join(root, `daemon-${index}.pid`);

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stop() {
  if (!fs.existsSync(pidPath)) {
    console.error(`No pid file found at ${pidPath}; nothing to stop.`);
    process.exit(1);
  }
  const pid = Number(fs.readFileSync(pidPath, "utf8"));
  if (!pid || !isRunning(pid)) {
    console.error(`No running process for pid ${pid}; removing ${pidPath}`);
    fs.rmSync(pidPath, { force: true });
    process.exit(1);
  }
  process.kill(pid, "SIGTERM");
  console.log(`Sent SIGTERM to project-host (pid ${pid}).`);
  fs.rmSync(pidPath, { force: true });
}

stop();
