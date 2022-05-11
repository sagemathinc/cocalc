// This file allows you to run a jupyter kernel via `launch_jupyter_kernel`.
// You have to provide the kernel name and (optionally) launch options for execa [1].
//
// Example:
// import {launch_jupyter_kernel} from "./launch_jupyter_kernel";
// const kernel = await launch_jupyter_kernel("python3", {detached: true, cwd: "/home/user"})
//
// * shell channel: `${kernel.config.ip}:${kernel.config.shell_port}`
// * `kernel.spawn` holds the process and you have to close it when finished.
// * Unless  `cleanupConnectionFile` is false, the connection file will be deleted when finished.
//
// Ref:
// [1] execa: https://github.com/sindresorhus/execa#readme
//
// History:
// This is a port of https://github.com/nteract/spawnteract/ to TypeScript (with minor changes).
// Original license: BSD-3-Clause and this file is also licensed under BSD-3-Clause!
// Author: Harald Schilly <hsy@sagemath.com>

import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";
import * as uuid from "uuid";

import { findAll } from "kernelspecs";
import * as jupyter_paths from "jupyter-paths";

import { getPorts as getPortsOrig } from "portfinder";
const get_ports = promisify(getPortsOrig);
import { writeFile } from "jsonfile";
import execa from "execa";
import mkdirp from "mkdirp";

// this is passed to "execa", there are more options
// https://github.com/sindresorhus/execa#options
// https://nodejs.org/dist/latest-v6.x/docs/api/child_process.html#child_process_options_stdio
type StdIO = "pipe" | "ignore" | "inherit" | undefined;
export interface LaunchJupyterOpts {
  detached: boolean;
  stdio?: StdIO | (StdIO | number)[];
  env: { [key: string]: string };
  cwd?: string;
  cleanupConnectionFile?: boolean;
  cleanup?: boolean;
  preferLocal?: boolean;
  localDir?: string;
  execPath?: string;
  buffer?: boolean;
  reject?: boolean;
  stripFinalNewline?: boolean;
  shell?: boolean | string; // default false
}

function connection_info(ports) {
  return {
    version: 5,
    key: uuid.v4(),
    signature_scheme: "hmac-sha256",
    transport: "tcp",
    ip: "127.0.0.1",
    hb_port: ports[0],
    control_port: ports[1],
    shell_port: ports[2],
    stdin_port: ports[3],
    iopub_port: ports[4],
  };
}

const DEFAULT_PORT_OPTS = { port: 9000, host: "127.0.0.1" } as const;

// gather the connection information for a kernel, write it to a json file, and return it
async function write_connection_file(port_options?: {
  port?: number;
  host?: string;
}) {
  const options = { ...DEFAULT_PORT_OPTS, ...port_options };
  const ports = await get_ports(5, options);

  // Make sure the kernel runtime dir exists before trying to write the kernel file.
  const runtimeDir = jupyter_paths.runtimeDir();
  await mkdirp(runtimeDir);

  // Write the kernel connection file -- filename uses the UUID4 key
  const config = connection_info(ports);
  const connection_file = path.join(runtimeDir, `kernel-${config.key}.json`);

  await writeFile(connection_file, config);
  return { config, connection_file };
}

// if spawn options' cleanupConnectionFile is true, the connection file is removed
function cleanup(connectionFile) {
  try {
    fs.unlinkSync(connectionFile);
  } catch (e) {
    return;
  }
}

const DEFAULT_SPAWN_OPTIONS = {
  cleanupConnectionFile: true,
  env: {},
} as const;

// actually launch the kernel.
// the returning object contains all the configuration information and in particular,
// `spawn` is the running process started by "execa"
function launch_kernel_spec(
  kernel_spec,
  config,
  connection_file: string,
  spawn_options: LaunchJupyterOpts
) {
  const argv = kernel_spec.argv.map((x) =>
    x.replace("{connection_file}", connection_file)
  );

  const full_spawn_options = { ...DEFAULT_SPAWN_OPTIONS, ...spawn_options };

  full_spawn_options.env = {
    ...process.env,
    ...kernel_spec.env,
    ...spawn_options.env,
  };

  const running_kernel = execa(argv[0], argv.slice(1), full_spawn_options);

  if (full_spawn_options.cleanupConnectionFile !== false) {
    running_kernel.on("exit", (_code, _signal) => cleanup(connection_file));
    running_kernel.on("error", (_code, _signal) => cleanup(connection_file));
  }
  return {
    spawn: running_kernel,
    connection_file,
    config,
    kernel_spec,
  };
}

// for a given kernel name and launch options: prepare the kernel file and launch the process
// optionally, provide cached kernel specs to bypass `findAll()
export async function launch_jupyter_kernel(
  name: string,
  spawn_options: LaunchJupyterOpts,
  cached_specs?: any
) {
  const specs = cached_specs ?? (await findAll());
  const kernel_spec = specs[name];
  if (kernel_spec == null) {
    throw new Error(
      `No spec available for kernel "${name}".  Available specs: ${JSON.stringify(
        Object.keys(specs)
      )}`
    );
  }
  const launch_info = await write_connection_file();
  return launch_kernel_spec(
    kernel_spec.spec,
    launch_info.config,
    launch_info.connection_file,
    spawn_options
  );
}
