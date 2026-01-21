import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type DaemonAction = "start" | "stop";

type DaemonCommand = {
  action: DaemonAction;
  index: number;
};

const DEFAULT_ENV_FILE = "/etc/cocalc/project-host.env";

function parseIndex(arg: string | undefined): number {
  if (arg == null) {
    return 0;
  }
  const index = Number(arg);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(
      `Invalid instance index "${arg}". Provide a non-negative integer (e.g., 0, 1, 2).`,
    );
  }
  return index;
}

function parseDaemonArgs(args: string[]): DaemonCommand | null {
  if (args.length === 0) {
    return null;
  }
  const [first, second, third] = args;
  if (first === "start" || first === "stop") {
    return { action: first, index: parseIndex(second) };
  }
  const daemonIndex = args.indexOf("daemon");
  if (daemonIndex >= 0) {
    const action = args[daemonIndex + 1];
    const indexArg = args[daemonIndex + 2];
    if (action === "start" || action === "stop") {
      return { action, index: parseIndex(indexArg) };
    }
    if (action != null) {
      return { action: "start", index: parseIndex(action) };
    }
    return { action: "start", index: 0 };
  }
  if (first === "daemon") {
    if (second == null) {
      return { action: "start", index: 0 };
    }
    if (second === "start" || second === "stop") {
      return { action: second, index: parseIndex(third) };
    }
    return { action: "start", index: parseIndex(second) };
  }
  if (first === "--daemon" || first === "--daemon-start") {
    return { action: "start", index: parseIndex(second) };
  }
  if (first === "--daemon-stop") {
    return { action: "stop", index: parseIndex(second) };
  }
  return null;
}

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadEnvFromFile(envFile: string): Record<string, string> {
  if (!fs.existsSync(envFile)) {
    return {};
  }
  try {
    const content = fs.readFileSync(envFile, "utf8");
    return parseEnvFile(content);
  } catch {
    return {};
  }
}

function normalizeEnv(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function ensureDefaults(env: Record<string, string>, index: number): void {
  if (!env.COCALC_DISABLE_BEES) {
    env.COCALC_DISABLE_BEES = "no";
  }
  if (!env.MASTER_CONAT_SERVER) {
    env.MASTER_CONAT_SERVER = "http://localhost:9001";
  }
  if (!env.PROJECT_HOST_NAME) {
    env.PROJECT_HOST_NAME = `host-${index}`;
  }
  if (!env.PROJECT_HOST_REGION) {
    env.PROJECT_HOST_REGION = "west";
  }
  if (!env.PROJECT_HOST_PUBLIC_URL) {
    env.PROJECT_HOST_PUBLIC_URL = `http://localhost:${9002 + index}`;
  }
  if (!env.PROJECT_HOST_INTERNAL_URL) {
    env.PROJECT_HOST_INTERNAL_URL = `http://localhost:${9002 + index}`;
  }
  if (!env.PROJECT_HOST_SSH_SERVER) {
    env.PROJECT_HOST_SSH_SERVER = `localhost:${2222 + index}`;
  }
  if (!env.COCALC_FILE_SERVER_MOUNTPOINT) {
    env.COCALC_FILE_SERVER_MOUNTPOINT = "/btrfs";
  }
  if (!env.PROJECT_RUNNER_NAME) {
    env.PROJECT_RUNNER_NAME = String(index);
  }
  if (!env.HOST) {
    env.HOST = "0.0.0.0";
  }
  if (!env.PORT) {
    env.PORT = String(9002 + index);
  }
  if (!env.COCALC_SSH_SERVER) {
    env.COCALC_SSH_SERVER = `localhost:${2222 + index}`;
  }
}

function resolveEnv(index: number): {
  env: Record<string, string>;
  dataDir: string;
  logPath: string;
  pidPath: string;
} {
  const fileEnv = loadEnvFromFile(DEFAULT_ENV_FILE);
  const env = { ...fileEnv, ...normalizeEnv(process.env) };
  const dataDir = env.COCALC_DATA ?? env.DATA;
  if (!dataDir) {
    throw new Error(
      "COCALC_DATA (or DATA) must be set, or provide /etc/cocalc/project-host.env",
    );
  }
  env.COCALC_DATA = env.COCALC_DATA ?? dataDir;
  env.DATA = env.DATA ?? dataDir;
  if (!env.COCALC_BIN_PATH && env.COCALC_PROJECT_TOOLS) {
    env.COCALC_BIN_PATH = env.COCALC_PROJECT_TOOLS;
  }
  if (env.COCALC_RUSTIC && !env.COCALC_RUSTIC_REPO) {
    env.COCALC_RUSTIC_REPO = path.join(env.COCALC_RUSTIC, "rustic");
  }
  ensureDefaults(env, index);
  const logPath = path.join(dataDir, "log");
  const pidPath = path.join(dataDir, "daemon.pid");
  if (!env.DEBUG_FILE) {
    env.DEBUG_FILE = logPath;
  }
  if (!env.DEBUG_CONSOLE) {
    env.DEBUG_CONSOLE = "no";
  }
  return { env, dataDir, logPath, pidPath };
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureNotAlreadyRunning(pidPath: string): void {
  if (!fs.existsSync(pidPath)) {
    return;
  }
  const pid = Number(fs.readFileSync(pidPath, "utf8"));
  if (pid && isRunning(pid)) {
    throw new Error(
      `project-host already running (pid ${pid}); stop it first or remove ${pidPath}`,
    );
  }
  fs.rmSync(pidPath, { force: true });
}

function resolveExec(root: string): { command: string; args: string[] } {
  const command =
    process.env.COCALC_PROJECT_HOST_DAEMON_EXEC ?? process.execPath;
  const args: string[] = [];
  if (path.basename(command) === "node") {
    args.push(path.join(root, "dist/main.js"));
  }
  return { command, args };
}

export function startDaemon(index = 0): void {
  const { env, dataDir, logPath, pidPath } = resolveEnv(index);
  ensureNotAlreadyRunning(pidPath);
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
  } catch (err) {
    console.error(`warning: unable to truncate log at ${logPath}:`, err);
  }
  const stdout = fs.openSync(logPath, "a");
  const stderr = fs.openSync(logPath, "a");
  const root = path.join(__dirname, "..");
  const { command, args } = resolveExec(root);
  const child = spawn(command, args, {
    cwd: root,
    env,
    detached: true,
    stdio: ["ignore", stdout, stderr],
  });
  child.unref();
  fs.writeFileSync(pidPath, String(child.pid));
  console.log(`project-host started (pid ${child.pid}); log=${logPath}`);
}

export function stopDaemon(index = 0): void {
  const { pidPath } = resolveEnv(index);
  if (!fs.existsSync(pidPath)) {
    throw new Error(`No pid file found at ${pidPath}; nothing to stop.`);
  }
  const pid = Number(fs.readFileSync(pidPath, "utf8"));
  if (!pid || !isRunning(pid)) {
    fs.rmSync(pidPath, { force: true });
    throw new Error(`No running process for pid ${pid}; removed ${pidPath}`);
  }
  process.kill(pid, "SIGTERM");
  fs.rmSync(pidPath, { force: true });
  console.log(`Sent SIGTERM to project-host (pid ${pid}).`);
}

export function handleDaemonCli(argv: string[]): boolean {
  const cmd = parseDaemonArgs(argv);
  if (!cmd) {
    return false;
  }
  if (cmd.action === "start") {
    startDaemon(cmd.index);
  } else {
    stopDaemon(cmd.index);
  }
  return true;
}
