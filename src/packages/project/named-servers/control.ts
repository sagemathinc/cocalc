/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPort from "get-port";
import { exec } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import basePath from "@cocalc/backend/base-path";
import { data } from "@cocalc/backend/data";
import { project_id } from "@cocalc/project/data";
import { INFO } from "@cocalc/project/info-json";
import { getLogger } from "@cocalc/project/logger";
import {
  type NamedServerName,
  NAMED_SERVER_NAMES,
} from "@cocalc/util/types/servers";
import getSpec from "./list";

const winston = getLogger("named-servers:control");

function assertNamedServer(name: string) {
  if (typeof name != "string" || !NAMED_SERVER_NAMES.includes(name as any)) {
    throw Error(`the named servers are: ${NAMED_SERVER_NAMES.join(", ")}`);
  }
}

function getBase(name: NamedServerName): string {
  const baseType = name === "rserver" ? "server" : "port";
  return join(basePath, `/${project_id}/${baseType}/${name}`);
}

// Returns the port or throws an exception.
export async function start(
  name: NamedServerName,
): Promise<{ port: number; url: string }> {
  assertNamedServer(name);
  winston.debug(`start ${name}`);
  const s = await status(name);
  if (s.state === "running") {
    winston.debug(`${name} is already running`);
    return { port: s.port, url: s.url };
  }
  const port = await getPort({ port: preferredPort(name) });
  // For servers that need a basePath, they will use this one.
  // Other servers (e.g., Pluto, code-server) that don't need
  // a basePath because they use only relative URL's are accessed
  // via .../project_id/server/${port}.
  let ip = INFO.location.host ?? "127.0.0.1";
  if (ip === "localhost") {
    ip = "127.0.0.1";
  }

  const base = getBase(name);
  const cmd = await getCommand(name, ip, port, base);
  winston.debug(`will start ${name} by running "${cmd}"`);

  const p = await paths(name);
  await writeFile(p.port, `${port}`);
  await writeFile(p.command, `#!/bin/sh\n${cmd}\n`);

  const child = exec(cmd, { cwd: process.env.HOME });
  await writeFile(p.pid, `${child.pid}`);
  return { port, url: base };
}

async function getCommand(
  name: NamedServerName,
  ip: string,
  port: number,
  base: string,
): Promise<string> {
  const { stdout, stderr } = await paths(name);
  const spec = getSpec(name);
  const cmd: string = await spec(ip, port, base);
  return `${cmd} 1>${stdout} 2>${stderr}`;
}

// Returns the state and port (if defined).
export async function status(
  name: NamedServerName,
): Promise<
  { state: "running"; port: number; url: string } | { state: "stopped" }
> {
  assertNamedServer(name);
  const { pid, port } = await paths(name);
  try {
    const pidValue = parseInt((await readFile(pid)).toString());
    // it might be running
    process.kill(pidValue, 0); // throws error if NOT running
    // it is running
    const portValue = parseInt((await readFile(port)).toString());
    // and there is a port file,
    // and the port is a number.
    if (!Number.isInteger(portValue)) {
      throw Error("invalid port");
    }
    return { state: "running", port: portValue, url: getBase(name) };
  } catch (_err) {
    // it's not running or the port isn't valid
    return { state: "stopped" };
  }
}

async function paths(name: NamedServerName): Promise<{
  pid: string;
  stderr: string;
  stdout: string;
  port: string;
  command: string;
}> {
  const path = join(data, "named_servers", name);
  try {
    await mkdir(path, { recursive: true });
  } catch (_err) {
    // probably already exists
  }
  return {
    pid: join(path, "pid"),
    stderr: join(path, "stderr"),
    stdout: join(path, "stdout"),
    port: join(path, "port"),
    command: join(path, "command.sh"),
  };
}

function preferredPort(name: NamedServerName): number | undefined {
  const p = process.env[`COCALC_${name.toUpperCase()}_PORT`];
  if (p == null) {
    return p;
  }
  return parseInt(p);
}
