#!/usr/bin/env node
// Stop the daemon started by daemon-start.js

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pidPath = path.join(root, "daemon.pid");

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
    console.error("No pid file found; nothing to stop.");
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
