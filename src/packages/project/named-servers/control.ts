import { promisify } from "util";
import { join } from "path";
import { exec } from "child_process";
import {
  mkdir as mkdir0,
  readFile as readFile0,
  writeFile as writeFile0,
} from "fs";
import { getLogger } from "@cocalc/project/logger";
import { data } from "@cocalc/util-node/data";
import basePath from "@cocalc/util-node/base-path";
import getSpec from "./spec";
import getPort from "get-port";
import { project_id } from "@cocalc/project/data";
import { INFO } from "@cocalc/project/info-json";

const mkdir = promisify(mkdir0);
const readFile = promisify(readFile0);
const writeFile = promisify(writeFile0);

const winston = getLogger("named-servers:control");

// Returns the port or throws an exception.
export async function start(name: string): Promise<number> {
  winston.debug(`start ${name}`);
  const s = await status(name);
  if (s.status == "running") {
    winston.debug(`${name} is already running`);
    return s.port;
  }
  const port = await getPort({ port: preferredPort(name) });
  // For servers that need a basePath, they will use this one.
  // Other servers (e.g., Pluto, code-server) that don't need
  // a basePath because they use only relative URL's are accessed
  // via .../project_id/server/${port}.
  let ip = INFO.location.host ?? "127.0.0.1";
  if (ip == "localhost") {
    ip = "127.0.0.1";
  }
  const base = join(basePath, `/${project_id}/port/${name}`);
  const cmd = await getCommand(name, ip, port, base);
  winston.debug(`will start ${name} by running "${cmd}"`);

  const child = exec(cmd, { cwd: process.env.HOME });
  const p = await paths(name);
  await writeFile(p.port, `${port}`);
  await writeFile(p.pid, `${child.pid}`);
  await writeFile(p.command, `$!/bin/sh\n${cmd}\n`);
  return port;
}

async function getCommand(
  name: string,
  ip: string,
  port: number,
  base: string
): Promise<string> {
  const { stdout, stderr } = await paths(name);
  const spec = getSpec(name);
  const cmd = spec(ip, port, base);
  return `${cmd} 1>${stdout} 2>${stderr}`;
}

// Returns the status and port (if defined).
export async function status(
  name: string
): Promise<{ status: "running"; port: number } | { status: "stopped" }> {
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
    return { status: "running", port: portValue };
  } catch (_err) {
    // it's not running or the port isn't valid
    return { status: "stopped" };
  }
}

async function paths(name: string): Promise<{
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

function preferredPort(name: string): number | undefined {
  // TODO: can probably delete these fallbacks soon.
  if (name == "jupyter" && process.env.COCALC_JUPYTER_NOTEBOOK_PORT) {
    // backward compat
    return parseInt(process.env.COCALC_JUPYTER_NOTEBOOK_PORT);
  }
  if (name == "jupyterlab" && process.env.COCALC_JUPYTER_LAB_PORT) {
    return parseInt(process.env.COCALC_JUPYTER_LAB_PORT);
  }
  const p = process.env[`COCALC_{name.toUpperCase()}_PORT`];
  if (p == null) return p;
  return parseInt(p);
}
