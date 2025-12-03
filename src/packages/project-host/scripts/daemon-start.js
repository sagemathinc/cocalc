#!/usr/bin/env node
// Simple daemon-style starter for project-host.
// Defaults mirror the local "g" script but can be overridden via env vars.

const { spawn, execSync } = require("node:child_process");
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
const suffix = `-${index}`;
const logPath = process.env.DEBUG_FILE || path.join(root, `log${suffix}`);
const pidPath = path.join(root, `daemon${suffix}.pid`);

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureNotAlreadyRunning() {
  if (fs.existsSync(pidPath)) {
    const pid = Number(fs.readFileSync(pidPath, "utf8"));
    if (pid && isRunning(pid)) {
      console.error(
        `project-host already running (pid ${pid}); stop it first or remove ${pidPath}`,
      );
      process.exit(1);
    }
  }
}

function writePid(pid) {
  fs.writeFileSync(pidPath, String(pid));
}

function build() {
  execSync("pnpm run build", { cwd: root, stdio: "inherit" });
}

function start() {
  ensureNotAlreadyRunning();
  build();

  // Truncate log for a clean run
  try {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
  } catch (err) {
    console.error(`warning: unable to truncate log at ${logPath}:`, err);
  }

  const env = {
    ...process.env,
    MASTER_CONAT_SERVER: "http://localhost:9001",
    PROJECT_HOST_NAME: `host-${index}`,
    PROJECT_HOST_REGION: "west",
    PROJECT_HOST_PUBLIC_URL: `http://localhost:${9002 + index}`,
    PROJECT_HOST_INTERNAL_URL: `http://localhost:${9002 + index}`,
    PROJECT_HOST_SSH_SERVER: `localhost:${2222 + index}`,
    // Keep the legacy variable in sync for components that still read it.
    COCALC_SSH_SERVER: `localhost:${2222 + index}`,
    COCALC_FILE_SERVER_MOUNTPOINT:
      process.env.COCALC_FILE_SERVER_MOUNTPOINT ||
      `/home/wstein/scratch/btrfs2/mnt/${index}`,
    PROJECT_RUNNER_NAME: process.env.PROJECT_RUNNER_NAME || String(index),
    HOST: process.env.HOST || "0.0.0.0",
    PORT: process.env.PORT || String(9002 + index),
    // Keep sqlite, log, and pid files isolated per instance.
    COCALC_LITE_SQLITE_FILENAME:
      process.env.COCALC_LITE_SQLITE_FILENAME ||
      path.join(root, `data-${index}`, "lite", "hub", "sqlite.db"),
    DEBUG: process.env.DEBUG || "cocalc:*",
    DEBUG_CONSOLE: process.env.DEBUG_CONSOLE || "no",
    DEBUG_FILE: logPath,
    COCALC_SSH_SERVER: `localhost:${2222 + index}`,
  };

  // Append logs
  const stdout = fs.openSync(logPath, "a");
  const stderr = fs.openSync(logPath, "a");

  const child = spawn("node", ["dist/main.js"], {
    cwd: root,
    env,
    detached: true,
    stdio: ["ignore", stdout, stderr],
  });

  child.unref();
  writePid(child.pid);
  console.log(`project-host started (pid ${child.pid}); log=${logPath}`);
}

start();
