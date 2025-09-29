/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPort from "get-port";
import { spawn } from "node:child_process";
import { join } from "node:path";
import basePath from "@cocalc/backend/base-path";
import { project_id } from "@cocalc/project/data";
import { INFO } from "@cocalc/project/info-json";
import { getLogger } from "@cocalc/project/logger";
import {
  type NamedServerName,
  NAMED_SERVER_NAMES,
} from "@cocalc/util/types/servers";
import getSpec from "./list";
import { delay } from "awaiting";

const winston = getLogger("named-servers:control");

function assertNamedServer(name: string) {
  if (typeof name != "string" || !NAMED_SERVER_NAMES.includes(name as any)) {
    throw Error(`the named servers are: ${NAMED_SERVER_NAMES.join(", ")}`);
  }
}

function getBase(name: string, port: number): string {
  const baseType = name === "rserver" ? "server" : "port";
  return join(basePath, `/${project_id}/${baseType}/${port}/`);
}

interface SpawnedServer {
  child: ReturnType<typeof spawn>;
  port: number;
  url: string;
  stdout: Buffer;
  stderr: Buffer;
  spawnError?;
  exit?: { code; signal? };
  cmd: string;
  args: string[];
}

// The servers are children processes:
const children: { [name: string]: SpawnedServer } = {};
export { children };

// Returns the port or throws an exception.
export async function start(name: NamedServerName) {
  assertNamedServer(name);
  winston.debug(`start ${name}`);
  const s = await status(name);
  if (s.state == "running") {
    winston.debug(`${name} is running`);
    return s;
  }
  const server = children[name];
  if (server != null) {
    server.child.stdout?.removeAllListeners();
    server.child.stderr?.removeAllListeners();
    server.child.removeAllListeners();
    delete children[name];
  }

  const port = await getPort({ port: preferredPort(name) });
  // For servers that need a basePath, they will use this one.
  // Other servers (e.g., Pluto, code-server) that don't need
  // a basePath because they use only relative URL's are accessed
  // via .../project_id/server/${port}.
  let ip = INFO?.location.host ?? "127.0.0.1";
  if (ip === "localhost") {
    ip = "127.0.0.1";
  }

  const url = getBase(name, port);
  const [cmd, ...args] = await getCommand(name, ip, port, url);
  winston.debug(`will start ${name} by running "${cmd} ${args.join(" ")}"`);

  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.env.HOME,
  });
  children[name] = {
    child,
    port,
    url,
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    cmd,
    args,
  };
  watchOutput(children[name]);
  const s2 = await status(name);
  if (s2.state == "stopped") {
    throw Error("bug");
  }
  return s2;
}

async function getCommand(
  name: NamedServerName,
  ip: string,
  port: number,
  url: string,
): Promise<string[]> {
  const spec = getSpec(name);
  return await spec(ip, port, url);
}

// Returns the state and port (if defined).
export async function status(name: NamedServerName): Promise<
  | {
      state: "running" | "stopped";
      port: number;
      url: string;
      pid?: number;
      stdout: Buffer;
      stderr: Buffer;
      spawnError?;
      exit?: { code; signal? };
    }
  | { state: "stopped" }
> {
  assertNamedServer(name);
  let server = children[name];
  if (server == null) {
    return { state: "stopped" };
  }
  const { child, ...status } = server;
  const state = child.exitCode != null ? "stopped" : "running";
  return {
    state,
    pid: state == "running" ? child.pid : undefined,
    ...status,
  };
}

const GRACE_PERIOD = 1000;
export async function stop(name: NamedServerName) {
  assertNamedServer(name);
  let server = children[name];
  if (server == null || server.child.exitCode != null) {
    // already stopped
    return;
  }
  const { child } = server;
  child.kill("SIGTERM");
  // Force kill after grace period
  await delay(GRACE_PERIOD);
  if (!child.killed) {
    child.kill("SIGKILL");
  }
  return;
}

const PORTS = {
  jupyterlab: 6002,
  jupyter: 6003,
  code: 6004,
  pluto: 6005,
  rserver: 6006,
};

function preferredPort(name: NamedServerName): number | undefined {
  return PORTS[name];
}

function watchOutput(server: SpawnedServer) {
  const { child } = server;
  if (!child.stdout || !child.stderr) {
    throw new Error("spawn with stdio: 'pipe' to capture output");
  }

  const MAX = 1 * 1024 * 1024; // 1 MiB cap
  const append = (prev: Buffer, chunk: Buffer) => {
    if (prev.length + chunk.length <= MAX) {
      // Pre-size concat to avoid extra alloc
      return Buffer.concat([prev, chunk], prev.length + chunk.length);
    }
    // Keep the most recent tail up to MAX
    if (chunk.length >= MAX) {
      return chunk.subarray(chunk.length - MAX);
    }
    const keep = prev.subarray(prev.length - (MAX - chunk.length));
    return Buffer.concat([keep, chunk], MAX);
  };

  child.stdout.on("data", (chunk: Buffer) => {
    server.stdout = append(server.stdout, chunk);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    server.stderr = append(server.stderr, chunk);
  });

  child.on("error", (err) => {
    server.spawnError = err; // rename to clarify it’s a spawn error
  });

  child.on("exit", (code, signal) => {
    server.exit = { code, signal };
  });
}

function closeAll() {
  for (const server of Object.values(children)) {
    server.child.kill("SIGKILL");
  }
}

process.once("exit", closeAll);
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
