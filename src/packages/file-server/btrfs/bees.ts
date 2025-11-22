/*
Automate running BEES on the btrfs pool.
*/

import { spawn } from "node:child_process";
import { delay } from "awaiting";
import getLogger from "@cocalc/backend/logger";
import { sudo } from "./util";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { join } from "node:path";

const logger = getLogger("file-server:btrfs:bees");

interface Options {
  // average load target: default=1
  loadavgTarget?: number;
  // 0-8: default 1
  verbose?: number;
  // hash table size: default 1G
  size?: string;
}

const children: any[] = [];
export default async function bees(
  mountpoint: string,
  { loadavgTarget = 1, verbose = 1, size = "1G" }: Options = {},
) {
  const beeshome = join(mountpoint, ".beeshome");
  if (!(await exists(beeshome))) {
    await sudo({ command: "btrfs", args: ["subvolume", "create", beeshome] });
    // disable COW
    await sudo({ command: "chattr", args: ["+C", beeshome] });
  }
  const dat = join(beeshome, "beeshash.dat");
  if (!(await exists(dat))) {
    await sudo({ command: "truncate", args: ["-s", size, dat] });
    await sudo({ command: "chmod", args: ["700", dat] });
  }

  const args: string[] = ["bees", "-v", `${verbose}`];
  if (loadavgTarget) {
    args.push("-g", `${loadavgTarget}`);
  }
  args.push(mountpoint);
  logger.debug(`Running 'sudo ${args.join(" ")}'`);
  const child = spawn("sudo", args);
  children.push(child);
  let error: string = "";
  child.once("error", (err) => {
    error = `${err}`;
  });
  let stderr = "";
  const f = (chunk: Buffer) => {
    stderr += chunk.toString();
  };
  child.stderr.on("data", f);
  await delay(1000);
  if (error) {
    error += stderr;
  } else if (child.exitCode) {
    error = `failed to started bees: ${stderr}`;
  }
  if (error) {
    logger.debug("ERROR: ", error);
    child.kill("SIGKILL");
    throw error;
  }
  child.stderr.removeListener("data", f);
  return child;
}

export function close() {
  for (const child of children) {
    child.kill("SIGINT");
    setTimeout(() => child.kill("SIGKILL"), 1000);
  }
  children.length = 0;
}

process.once("exit", close);
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
