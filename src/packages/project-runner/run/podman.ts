/*
Runner based on podman.

DEPENDENCIES:

   sudo apt-get install rsync podman

*/

import getLogger from "@cocalc/backend/logger";
import { nodePath } from "./mounts";
import { isValidUUID } from "@cocalc/util/misc";
import { ensureConfFilesExists, setupDataPath, writeSecretToken } from "./util";
import { getEnvironment } from "./env";
import { mkdir } from "fs/promises";
import { spawn } from "node:child_process";
import { type Configuration } from "./types";
export { type Configuration };
import { getCoCalcMounts, COCALC_SRC } from "./mounts";
import { mountHome, setQuota } from "./filesystem";
import { executeCode } from "@cocalc/backend/execute-code";
import { join } from "path";
import * as rootFilesystem from "./overlay";
import { type ProjectState } from "@cocalc/conat/project/runner/state";

const logger = getLogger("project-runner:podman");
const children: { [project_id: string]: any } = {};

const GRACE_PERIOD = 2000;

export async function start({
  project_id,
  config,
}: {
  project_id: string;
  config?: Configuration;
}) {
  if (!isValidUUID(project_id)) {
    throw Error("start: project_id must be valid");
  }
  logger.debug("start", { project_id, config: { ...config, secret: "xxx" } });
  if (children[project_id] != null && children[project_id].exitCode == null) {
    logger.debug("start -- already running");
    return;
  }

  const home = await mountHome(project_id);
  logger.debug("start: got home", { project_id, home });
  const rootfs = await rootFilesystem.mount({ project_id, home, config });
  logger.debug("start: got rootfs", { project_id, rootfs });
  await mkdir(home, { recursive: true });
  logger.debug("start: created home", { project_id });
  await ensureConfFilesExists(home);
  logger.debug("start: created conf files", { project_id });
  const env = getEnvironment({
    project_id,
    env: config?.env,
    HOME: "/home/user",
  });
  await setupDataPath(home);
  logger.debug("start: setup data path", { project_id });
  if (config?.secret) {
    await writeSecretToken(home, config.secret);
    logger.debug("start: wrote secret", { project_id });
  }

  if (config?.disk) {
    // TODO: maybe this should be done in parallel with other things
    // to make startup time slightly faster (?) -- could also be incorporated
    // into mount.
    await setQuota(project_id, config.disk);
    logger.debug("start: set disk quota", { project_id });
  }

  const args: string[] = ["run", "--rm", "--network=host", "--user=0:0"];

  const cmd = "podman";
  const script = join(COCALC_SRC, "/packages/project/bin/cocalc-project.js");

  args.push("--hostname", `project-${project_id}`);
  args.push("--name", `project-${project_id}`);

  const mounts = getCoCalcMounts();
  for (const path in mounts) {
    args.push("-v", `${path}:${mounts[path]}:ro`);
  }
  args.push("-v", `${home}:${env.HOME}`);
  for (const name in env) {
    args.push("-e", `${name}=${env[name]}`);
  }

  args.push("--rootfs", rootfs);
  args.push(nodePath);
  args.push(script, "--init", "project_init.sh");

  console.log(`${cmd} ${args.join(" ")}`);
  logger.debug("start: launching container - ", `${cmd} ${args.join(" ")}`);

  const child = spawn(cmd, args);
  children[project_id] = child;

  //   child.stdout.on("data", (chunk: Buffer) => {
  //     logger.debug(`project_id=${project_id}.stdout: `, chunk.toString());
  //   });
  child.stderr.on("data", (chunk: Buffer) => {
    logger.debug(`project_id=${project_id}.stderr: `, chunk.toString());
  });
}

export async function stop({ project_id }) {
  if (!isValidUUID(project_id)) {
    throw Error("stop: project_id must be valid");
  }
  logger.debug("stop", { project_id });
  const child = children[project_id];

  if (child != null && child.exitCode == null) {
    // make it so filesystem gets unmounted as soon as no longer
    // locked by podman
    (async () => {
      try {
        await rootFilesystem.unmount(project_id);
      } catch {}
    })();

    // now stop container and delete it.
    try {
      await podman([
        "rm",
        "-f",
        "-t",
        `${GRACE_PERIOD / 1000}`,
        `project-${project_id}`,
      ]);
    } catch {}
    delete children[project_id];
  }
}

async function podman(args: string[]) {
  return await executeCode({ command: "podman", args, err_on_exit: true });
}

async function state(project_id): Promise<ProjectState> {
  const { stdout } = await podman([
    "ps",
    "--filter",
    `name=project-${project_id}`,
    "--format",
    "{{.State}}",
  ]);
  return stdout.trim() == "running" ? "running" : "opened";
}

export async function status({ project_id }) {
  if (!isValidUUID(project_id)) {
    throw Error("status: project_id must be valid");
  }
  logger.debug("status", { project_id });
  // TODO
  return { state: await state(project_id), ip: "127.0.0.1" };
}

export async function close() {
  const v: any[] = [];
  for (const project_id in children) {
    logger.debug(`killing project_id=${project_id}`);
    v.push(stop({ project_id }));
    delete children[project_id];
  }
  await Promise.all(v);
}

// important because it kills all
// the processes that were spawned
process.once("exit", close);
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
