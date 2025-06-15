// This file allows you to run a jupyter kernel via `launch_jupyter_kernel`.
// You have to provide the kernel name and (optionally) launch options.
//
// Example:
// import launchJupyterKernel from "./launch-jupyter-kernel";
// const kernel = await launchJupyterKernel("python3", {cwd: "/home/user"})
//
// * shell channel: `${kernel.config.ip}:${kernel.config.shell_port}`
// * `kernel.spawn` holds the process and you have to close it when finished.
// * Unless  `cleanupConnectionFile` is false, the connection file will be deleted when finished.
//
// History:
// This is a port of https://github.com/nteract/spawnteract/ to TypeScript (with minor changes).
// Original license: BSD-3-Clause and this file is also licensed under BSD-3-Clause!
// Author: Harald Schilly <hsy@sagemath.com>
// Author: William Stein <wstein@sagemath.com>

import * as path from "path";
import * as fs from "fs";
import * as uuid from "uuid";
import { mkdir } from "fs/promises";
import { spawn } from "node:child_process";
import { findAll } from "kernelspecs";
import * as jupyter_paths from "jupyter-paths";
import { executeCode } from "@cocalc/backend/execute-code";
import getPorts from "./get-ports";
import { writeFile } from "jsonfile";
import mkdirp from "mkdirp";
import shellEscape from "shell-escape";
import { envForSpawn } from "@cocalc/backend/misc";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("launch-kernel");

// this is passed to "execa", there are more options
// https://github.com/sindresorhus/execa#options
// https://nodejs.org/dist/latest-v6.x/docs/api/child_process.html#child_process_options_stdio
type StdIO = "pipe" | "ignore" | "inherit" | undefined;
export interface LaunchJupyterOpts {
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
  // command line options for ulimit.  You can launch a kernel
  // but with these options set.  Note that this uses the shell
  // to wrap launching the kernel, so it's more complicated.
  ulimit?: string;
}

export interface SpawnedKernel {
  spawn; // output of execa
  connectionFile: string;
  config: ConnectionInfo;
  kernel_spec;
  initCode?: string[];
}

interface ConnectionInfo {
  version: number;
  key: string;
  signature_scheme: "hmac-sha256";
  transport: "tcp" | "ipc";
  ip: string;
  hb_port: number;
  control_port: number;
  shell_port: number;
  stdin_port: number;
  iopub_port: number;
}

function connectionInfo(ports): ConnectionInfo {
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
async function writeConnectionFile(port_options?: {
  port?: number;
  host?: string;
}) {
  const options = { ...DEFAULT_PORT_OPTS, ...port_options };
  const ports = await getPorts(5, options);

  // Make sure the kernel runtime dir exists before trying to write the kernel file.
  const runtimeDir = jupyter_paths.runtimeDir();
  await mkdirp(runtimeDir);

  // Write the kernel connection file -- filename uses the UUID4 key
  const config = connectionInfo(ports);
  const connectionFile = path.join(runtimeDir, `kernel-${config.key}.json`);

  await writeFile(connectionFile, config);
  return { config, connectionFile };
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
async function launchKernelSpec(
  kernel_spec,
  config: ConnectionInfo,
  connectionFile: string,
  spawn_options: LaunchJupyterOpts,
): Promise<SpawnedKernel> {
  const argv = kernel_spec.argv.map((x) =>
    x.replace("{connection_file}", connectionFile),
  );

  const full_spawn_options = {
    ...DEFAULT_SPAWN_OPTIONS,
    ...spawn_options,
    detached: true, // for cocalc we always assume this
  };

  full_spawn_options.env = {
    ...envForSpawn(),
    ...kernel_spec.env,
    ...spawn_options.env,
  };

  let running_kernel;

  if (full_spawn_options.cwd != null) {
    await ensureDirectoryExists(full_spawn_options.cwd);
  }

  if (spawn_options.ulimit) {
    // Convert the ulimit arguments to a string
    const ulimitCmd = `ulimit ${spawn_options.ulimit}`;

    // Escape the command and arguments for safe usage in a shell command
    const escapedCmd = shellEscape(argv);

    // Prepend the ulimit command
    const bashCmd = `${ulimitCmd} && ${escapedCmd}`;

    // Execute the command with ulimit
    running_kernel = executeCode({
      command: bashCmd,
      ...full_spawn_options,
      bash: true,
    });
  } else {
    running_kernel = spawn(argv[0], argv.slice(1), full_spawn_options);
  }

  running_kernel.on("error", (code, signal) => {
    logger.debug("launchKernelSpec: ERROR -- ", { argv, code, signal });
  });

  if (full_spawn_options.cleanupConnectionFile !== false) {
    running_kernel.on("exit", (_code, _signal) => cleanup(connectionFile));
    running_kernel.on("error", (_code, _signal) => cleanup(connectionFile));
  }
  return {
    spawn: running_kernel,
    connectionFile,
    config,
    kernel_spec,
  };
}

// For a given kernel name and launch options: prepare the kernel file and launch the process
export default async function launchJupyterKernel(
  name: string,
  spawn_options: LaunchJupyterOpts,
): Promise<SpawnedKernel> {
  const specs = await findAll();
  const kernel_spec = specs[name];
  if (kernel_spec == null) {
    throw new Error(
      `No spec available for kernel "${name}".  Available specs: ${JSON.stringify(
        Object.keys(specs),
      )}`,
    );
  }
  const { config, connectionFile } = await writeConnectionFile();
  return await launchKernelSpec(
    kernel_spec.spec,
    config,
    connectionFile,
    spawn_options,
  );
}

async function ensureDirectoryExists(path: string) {
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}
