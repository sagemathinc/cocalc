#!/usr/bin/env node
// Self-host connector daemon for multipass-based project-host VMs.
// Polls the hub for commands and executes them locally via multipass.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_POLL_SECONDS = 10;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_IMAGE = "24.04";
const VERSION = process.env.COCALC_SELF_HOST_CONNECTOR_VERSION ?? "0.0.1";

type Config = {
  base_url: string;
  connector_id?: string;
  connector_token?: string;
  poll_interval_seconds?: number;
  name?: string;
};

type CommandEnvelope = {
  id: string;
  action: "create" | "start" | "stop" | "delete" | "status";
  payload: Record<string, any>;
  issued_at?: string;
};

type State = {
  instances: Record<
    string,
    {
      name: string;
      image?: string;
      created_at?: string;
      last_state?: string;
      last_ipv4?: string[];
    }
  >;
};

function log(message: string, data?: Record<string, any>) {
  const ts = new Date().toISOString();
  if (data) {
    console.log(`${ts} ${message}`, data);
  } else {
    console.log(`${ts} ${message}`);
  }
}

function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_./:=,@+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatCommand(cmd: string, args: string[]): string {
  return [cmd, ...args].map(shellEscape).join(" ");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function configDir(): string {
  const base =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(base, "cocalc-connector");
}

function configPathFromArgs(args: Record<string, string>): string {
  const override = args["config"];
  if (override) return override;
  return path.join(configDir(), "config.json");
}

function statePathFromConfig(cfgPath: string): string {
  return path.join(path.dirname(cfgPath), "state.json");
}

function loadJsonFile<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJsonFile(filePath: string, data: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
}

function parseArgs(argv: string[]): {
  command: string;
  args: Record<string, string>;
} {
  const [command = "run", ...rest] = argv;
  const args: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const item = rest[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = rest[i + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return { command, args };
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runMultipass(args: string[]) {
  log("multipass exec", { command: formatCommand("multipass", args) });
  return await new Promise<{ stdout: string; stderr: string; code: number }>(
    (resolve) => {
      const proc = spawn("multipass", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
      proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      proc.on("close", (code) => {
        resolve({ stdout, stderr, code: code ?? 0 });
      });
    },
  );
}

async function multipassInfo(name: string) {
  const result = await runMultipass(["info", name, "--format", "json"]);
  if (result.code !== 0) {
    return { exists: false, error: result.stderr.trim() };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    const info = parsed?.info?.[name] ?? Object.values(parsed?.info ?? {})[0];
    return { exists: true, info };
  } catch (err) {
    return { exists: false, error: `invalid json: ${err}` };
  }
}

function formatSize(value?: unknown, fallbackGb?: number): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return `${value}G`;
  if (fallbackGb) return `${fallbackGb}G`;
  return undefined;
}

function cloudInitBaseDir(): string {
  const override = process.env.COCALC_CONNECTOR_CLOUD_INIT_DIR;
  if (override) return override;
  const home = os.homedir();
  return path.join(home, "cocalc-connector", "cloud-init");
}

function createCloudInitPaths(hostId: string): {
  initDir: string;
  initPath: string;
  baseDir: string;
  rootDir?: string;
} {
  const baseDir = cloudInitBaseDir();
  const suffix = `${hostId}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const initDir = path.join(baseDir, suffix);
  const initPath = path.join(initDir, "cloud-init.yml");
  const rootDir = process.env.COCALC_CONNECTOR_CLOUD_INIT_DIR
    ? undefined
    : path.dirname(baseDir);
  return { initDir, initPath, baseDir, rootDir };
}

function cleanupCloudInit(opts: {
  initPath: string;
  baseDir: string;
  rootDir?: string;
}) {
  try {
    fs.unlinkSync(opts.initPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log("cloud-init cleanup failed", {
        path: opts.initPath,
        error: String(err),
      });
    }
  }
  try {
    fs.rmSync(path.dirname(opts.initPath), { recursive: true, force: true });
    log("cloud-init cleaned", { path: opts.initPath });
  } catch (err) {
    log("cloud-init cleanup failed", {
      path: opts.initPath,
      error: String(err),
    });
  }
  try {
    fs.rmdirSync(opts.baseDir);
  } catch {
    // directory not empty
  }
  if (opts.rootDir) {
    try {
      fs.rmdirSync(opts.rootDir);
    } catch {
      // directory not empty
    }
  }
}

function indentBlock(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function wrapCloudInitScript(script: string): string {
  const trimmed = script.replace(/\s+$/g, "");
  const content = indentBlock(trimmed, 6);
  return `#cloud-config
write_files:
  - path: /root/cocalc-bootstrap.sh
    permissions: "0700"
    owner: root:root
    content: |
${content}
runcmd:
  - [ "/bin/bash", "/root/cocalc-bootstrap.sh" ]
`;
}

async function ensureMultipassAvailable() {
  const result = await runMultipass(["version"]);
  if (result.code !== 0) {
    fail(
      "Ubuntu Multipass not found or not working; install multipass first:\n\n    https://canonical.com/multipass\n\n",
    );
  }
}

async function ensureMultipassHealthy() {
  if (process.env.COCALC_CONNECTOR_SKIP_HEALTH_CHECK === "1") {
    log("multipass health check skipped");
    return;
  }
  const name = `cocalc-connector-check-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  log("multipass health check: launching", { name });
  const launch = await runMultipass([
    "launch",
    "--name",
    name,
    "--cpus",
    "1",
    "--memory",
    "1G",
    "--disk",
    "5G",
    DEFAULT_IMAGE,
  ]);
  if (launch.code !== 0) {
    throw new Error(
      `multipass health check failed: ${launch.stderr.trim() || "launch failed"}`,
    );
  }
  await runMultipass(["stop", name]);
  const del = await runMultipass(["delete", "--purge", name]);
  if (del.code !== 0) {
    log("multipass health check cleanup failed", {
      name,
      error: del.stderr.trim() || "delete failed",
    });
    return;
  }
  log("multipass health check ok", { name });
}

async function handleCreate(
  payload: Record<string, any>,
  state: State,
  statePath: string,
) {
  const hostId = String(payload.host_id ?? "");
  if (!hostId) throw new Error("create requires host_id");
  const name = String(payload.name ?? `cocalc-${hostId}`);
  const image = String(payload.image ?? DEFAULT_IMAGE);
  const cpus = payload.cpus ?? payload.vcpus;
  const mem = formatSize(payload.mem_gb ?? payload.memory_gb ?? payload.memory);
  const disk = formatSize(payload.disk_gb ?? payload.disk);
  const cloudInit = payload.cloud_init ?? payload.cloud_init_yaml;

  const existing = await multipassInfo(name);
  if (existing.exists) {
    state.instances[hostId] = {
      ...(state.instances[hostId] ?? {}),
      name,
      image,
      last_state: existing.info?.state,
      last_ipv4: existing.info?.ipv4 ?? [],
    };
    saveJsonFile(statePath, state);
    return {
      name,
      state: existing.info?.state,
      ipv4: existing.info?.ipv4 ?? [],
    };
  }

  const args = ["launch", "--name", name];
  if (cpus) args.push("--cpus", String(cpus));
  if (mem) args.push("--memory", mem);
  if (disk) args.push("--disk", disk);
  let initPath: string | undefined;
  let initBaseDir: string | undefined;
  let initRootDir: string | undefined;
  if (cloudInit) {
    const paths = createCloudInitPaths(hostId);
    initPath = paths.initPath;
    initBaseDir = paths.baseDir;
    initRootDir = paths.rootDir;
    fs.mkdirSync(paths.initDir, { recursive: true });
    const rawInit = String(cloudInit);
    const trimmed = rawInit.trimStart();
    let initKind = "raw";
    let initContents = rawInit;
    if (!/^#cloud-config\b/.test(trimmed)) {
      initKind = trimmed.startsWith("#!") ? "wrapped-script" : "wrapped";
      initContents = wrapCloudInitScript(rawInit);
    } else {
      initKind = "cloud-config";
    }
    fs.writeFileSync(initPath, initContents, { mode: 0o600 });
    const stats = fs.statSync(initPath);
    log("cloud-init written", {
      path: initPath,
      size: stats.size,
      mode: (stats.mode & 0o777).toString(8),
      kind: initKind,
    });
    args.push("--cloud-init", initPath);
  }
  args.push(image);

  const result = await runMultipass(args);
  if (initPath && result.code === 0 && initBaseDir) {
    cleanupCloudInit({
      initPath,
      baseDir: initBaseDir,
      rootDir: initRootDir,
    });
  }
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "multipass launch failed");
  }

  const info = await multipassInfo(name);
  state.instances[hostId] = {
    name,
    image,
    created_at: new Date().toISOString(),
    last_state: info.info?.state,
    last_ipv4: info.info?.ipv4 ?? [],
  };
  saveJsonFile(statePath, state);
  return { name, state: info.info?.state, ipv4: info.info?.ipv4 ?? [] };
}

async function handleStart(payload: Record<string, any>, state: State) {
  const hostId = String(payload.host_id ?? "");
  const name = String(payload.name ?? state.instances[hostId]?.name ?? "");
  if (!name) throw new Error("start requires host_id or name");
  const info = await multipassInfo(name);
  if (!info.exists) {
    return { name, state: "not_found" };
  }
  const result = await runMultipass(["start", name]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "multipass start failed");
  }
  const refreshed = await multipassInfo(name);
  return {
    name,
    state: refreshed.info?.state,
    ipv4: refreshed.info?.ipv4 ?? [],
  };
}

async function handleStop(payload: Record<string, any>, state: State) {
  const hostId = String(payload.host_id ?? "");
  const name = String(payload.name ?? state.instances[hostId]?.name ?? "");
  if (!name) throw new Error("stop requires host_id or name");
  const info = await multipassInfo(name);
  if (!info.exists) {
    return { name, state: "not_found" };
  }
  const result = await runMultipass(["stop", name]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "multipass stop failed");
  }
  const refreshed = await multipassInfo(name);
  return {
    name,
    state: refreshed.info?.state,
    ipv4: refreshed.info?.ipv4 ?? [],
  };
}

async function handleDelete(
  payload: Record<string, any>,
  state: State,
  statePath: string,
) {
  const hostId = String(payload.host_id ?? "");
  const name = String(payload.name ?? state.instances[hostId]?.name ?? "");
  if (!name) throw new Error("delete requires host_id or name");
  await runMultipass(["delete", name]);
  await runMultipass(["purge"]);
  if (hostId && state.instances[hostId]) {
    delete state.instances[hostId];
    saveJsonFile(statePath, state);
  }
  return { name, state: "deleted" };
}

async function handleStatus(
  payload: Record<string, any>,
  state: State,
  statePath: string,
) {
  const hostId = String(payload.host_id ?? "");
  const name = String(payload.name ?? state.instances[hostId]?.name ?? "");
  if (!name) throw new Error("status requires host_id or name");
  const info = await multipassInfo(name);
  if (!info.exists) {
    return { name, state: "not_found" };
  }
  if (hostId) {
    state.instances[hostId] = {
      ...(state.instances[hostId] ?? {}),
      name,
      last_state: info.info?.state,
      last_ipv4: info.info?.ipv4 ?? [],
    };
    saveJsonFile(statePath, state);
  }
  return { name, state: info.info?.state, ipv4: info.info?.ipv4 ?? [] };
}

async function executeCommand(
  cmd: CommandEnvelope,
  state: State,
  statePath: string,
) {
  switch (cmd.action) {
    case "create":
      return await handleCreate(cmd.payload, state, statePath);
    case "start":
      return await handleStart(cmd.payload, state);
    case "stop":
      return await handleStop(cmd.payload, state);
    case "delete":
      return await handleDelete(cmd.payload, state, statePath);
    case "status":
      return await handleStatus(cmd.payload, state, statePath);
    default:
      throw new Error(`unknown action ${cmd.action}`);
  }
}

async function pollOnce(
  config: Config,
  state: State,
  statePath: string,
): Promise<boolean> {
  const base = normalizeBaseUrl(config.base_url);
  const token = config.connector_token;
  if (!token) throw new Error("missing connector token");
  const nextRes = await fetchWithTimeout(`${base}/self-host/next`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (nextRes.status === 204) return false;
  if (!nextRes.ok) {
    throw new Error(`poll failed (${nextRes.status})`);
  }
  const cmd = (await nextRes.json()) as CommandEnvelope;
  log("command received", { id: cmd.id, action: cmd.action });
  let status: "ok" | "error" = "ok";
  let result: any = null;
  let error: string | undefined;
  try {
    result = await executeCommand(cmd, state, statePath);
  } catch (err) {
    status = "error";
    error = err instanceof Error ? err.message : String(err);
  }
  log("command finished", { id: cmd.id, action: cmd.action, status, error });
  const ackRes = await fetchWithTimeout(`${base}/self-host/ack`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: cmd.id,
      status,
      result,
      error,
    }),
  });
  if (!ackRes.ok) {
    log("ack failed", { id: cmd.id, status: ackRes.status });
  }
  return true;
}

async function runLoop(
  config: Config,
  cfgPath: string,
  opts: { checkHealth?: boolean } = {},
) {
  if (!config.base_url) throw new Error("base_url missing in config");
  if (!config.connector_token)
    throw new Error("connector_token missing in config");
  await ensureMultipassAvailable();
  if (opts.checkHealth) {
    await ensureMultipassHealthy();
  }
  const statePath = statePathFromConfig(cfgPath);
  const state = loadJsonFile<State>(statePath, { instances: {} });
  const pollSeconds = config.poll_interval_seconds ?? DEFAULT_POLL_SECONDS;
  const logEvery = Math.max(1, Math.round(60 / pollSeconds));
  let idlePolls = 0;
  log("connector started", {
    base_url: config.base_url,
    poll_seconds: pollSeconds,
  });
  while (true) {
    try {
      const hadCommand = await pollOnce(config, state, statePath);
      if (hadCommand) {
        idlePolls = 0;
      } else {
        idlePolls += 1;
        if (idlePolls % logEvery === 0) {
          log("poll ok (no commands)");
        }
      }
    } catch (err) {
      log("poll error", { error: String(err) });
    }
    await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
  }
}

async function pairConnector(args: Record<string, string>, cfgPath: string) {
  const baseUrl = args["base-url"] ?? args["url"];
  const token = args["token"] ?? args["pairing-token"];
  if (!baseUrl || !token) {
    fail("pair requires --base-url and --token");
  }
  const connectorInfo = {
    name: args["name"],
    version: VERSION,
    os: process.platform,
    arch: process.arch,
    capabilities: { multipass: true },
  };
  const res = await fetchWithTimeout(
    `${normalizeBaseUrl(baseUrl)}/self-host/pair`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairing_token: token,
        connector_info: connectorInfo,
      }),
    },
  );
  if (!res.ok) {
    fail(`pair failed (${res.status})`);
  }
  const payload = await res.json();
  const config: Config = {
    base_url: baseUrl,
    connector_id: payload.connector_id,
    connector_token: payload.connector_token,
    poll_interval_seconds:
      payload.poll_interval_seconds ?? DEFAULT_POLL_SECONDS,
    name: connectorInfo.name,
  };
  saveJsonFile(cfgPath, config);
  log("paired connector", {
    connector_id: payload.connector_id,
    config: cfgPath,
  });
}

function printHelp() {
  console.log(`Usage:
  cocalc-self-host-connector pair --base-url <url> --token <pairing_token> [--name <name>]
  cocalc-self-host-connector run [--config <path>] [--check]
`);
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  const cfgPath = configPathFromArgs(args);
  if (command === "-h" || command === "--help" || command === "help") {
    printHelp();
    return;
  }
  if (command === "pair") {
    await pairConnector(args, cfgPath);
    return;
  }
  const config = loadJsonFile<Config>(cfgPath, { base_url: "" });
  if (command === "run") {
    const checkHealth = args["check"] === "true";
    await runLoop(config, cfgPath, { checkHealth });
    return;
  }
  if (command === "once") {
    const statePath = statePathFromConfig(cfgPath);
    const state = loadJsonFile<State>(statePath, { instances: {} });
    await pollOnce(config, state, statePath);
    return;
  }
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
