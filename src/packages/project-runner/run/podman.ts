/*
Runner based on podman.

DEPENDENCIES:

   sudo apt-get install rsync podman

- podman -- to run projects
- rsync - to setup the rootfs

TODO: obviously, we will very likely change things below
so that pods are subprocesses so this server can be
restarted without restarting all projects it manages.
Maybe.  Perhaps we'll have two modes.

*/

import getLogger from "@cocalc/backend/logger";
import { nodePath } from "./mounts";
import { isValidUUID } from "@cocalc/util/misc";
import { ensureConfFilesExists, setupDataPath, writeSecretToken } from "./util";
import { getEnvironment } from "./env";
import { mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { getCoCalcMounts, COCALC_SRC } from "./mounts";
import { setQuota } from "./filesystem";
import { executeCode } from "@cocalc/backend/execute-code";
import { join } from "path";
import * as rootFilesystem from "./overlay";
import { type ProjectState } from "@cocalc/conat/project/runner/state";
import { type Configuration } from "@cocalc/conat/project/runner/types";
import { DEFAULT_PROJECT_IMAGE } from "@cocalc/util/db-schema/defaults";
import { podmanLimits } from "./limits";
import { init as initSidecar, sidecarImageName } from "./sidecar";
import {
  type SshServersFunction,
  type LocalPathFunction,
} from "@cocalc/conat/project/runner/types";
import { initSshKeys } from "@cocalc/backend/ssh-keys";
import { PROJECT_IMAGE_PATH } from "@cocalc/util/db-schema/defaults";

const logger = getLogger("project-runner:podman");
const children: { [project_id: string]: any } = {};

const GRACE_PERIOD = 3000;

export async function start({
  project_id,
  config,
  sshServers,
  localPath,
}: {
  project_id: string;
  config?: Configuration;
  sshServers?: SshServersFunction;
  localPath: LocalPathFunction;
}) {
  if (!isValidUUID(project_id)) {
    throw Error("start: project_id must be valid");
  }
  logger.debug("start", { project_id, config: { ...config, secret: "xxx" } });
  if (children[project_id] != null && children[project_id].exitCode == null) {
    logger.debug("start -- already running");
    return;
  }

  await initSidecar();
  const pod = `project-${project_id}`;
  try {
    await podman(["pod", "create", "--name", pod, "--network=pasta"]);
  } catch (err) {
    if (!`${err}`.includes("exists")) {
      throw err;
    }
  }

  const home = await localPath({ project_id });
  logger.debug("start: got home", { project_id, home });
  const mounts = getCoCalcMounts();
  const image = getImage(config);
  const servers = await sshServers?.({ project_id });
  await initSshKeys({ home, sshServers: servers });

  const env = await getEnvironment({
    project_id,
    env: config?.env,
    HOME: "/root",
    image,
  });
  const initMutagen = await startSidecar({
    image,
    project_id,
    home,
    mounts,
    env,
    pod,
    servers,
  });

  const rootfs = await rootFilesystem.mount({ project_id, home, config });
  logger.debug("start: got rootfs", { project_id, rootfs });
  await mkdir(home, { recursive: true });
  logger.debug("start: created home", { project_id });
  await ensureConfFilesExists(home);
  logger.debug("start: created conf files", { project_id });

  //   await writeMutagenConfig({
  //     home,
  //     sync: config?.sync,
  //     forward: config?.forward,
  //   });

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

  const args: string[] = [];
  args.push("run");
  args.push("--rm");
  args.push("--replace");
  args.push("--user=0:0");
  args.push("--pod", pod);

  const cmd = "podman";
  const script = join(COCALC_SRC, "/packages/project/bin/cocalc-project.js");

  args.push("--hostname", `project-${project_id}`);
  args.push("--name", `project-${project_id}`);

  for (const path in mounts) {
    args.push("-v", `${path}:${mounts[path]}:ro`);
  }
  args.push("-v", `${home}:${env.HOME}`);
  for (const name in env) {
    args.push("-e", `${name}=${env[name]}`);
  }

  args.push(...podmanLimits(config));

  // --init = have podman inject a tiny built in init script so we don't get zombies.
  args.push("--init");

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

  await initMutagen?.();
}

async function startSidecar({
  image,
  project_id,
  mounts,
  env,
  pod,
  home,
  servers,
}) {
  // sidecar: refactor
  const sidecarPodName = `sidecar-${project_id}`;
  const args2 = [
    "run",
    `--name=${sidecarPodName}`,
    "--detach",
    "--rm",
    "--replace",
    "--pod",
    pod,
    "--init",
  ];
  for (const path in mounts) {
    args2.push("-v", `${path}:${mounts[path]}:ro`);
  }
  args2.push("-v", `${home}:${env.HOME}`);
  for (const name in env) {
    args2.push("-e", `${name}=${env[name]}`);
  }

  args2.push(sidecarImageName, "mutagen", "daemon", "run");

  // always start with fresh .mutagen
  await rm(join(home, ".mutagen-dev"), { force: true, recursive: true });

  await podman(args2);

  if (servers.length == 0) {
    return;
  }

  const upperdir = join(PROJECT_IMAGE_PATH, image, "upperdir");
  await podman(
    [
      "exec",
      sidecarPodName,
      "rsync",
      "--relative",
      "-axH",
      `${servers[0].name}:${upperdir}/`,
      "/root/",
    ],
    10 * 60,
  );

  await podman(
    [
      "exec",
      sidecarPodName,
      "rsync",
      "-axH",
      "--exclude",
      ".local/share/overlay/**",
      "--exclude",
      ".cache/cocalc/**",
      "--exclude",
      ".mutagen-dev/**",
      "--exclude",
      ".ssh/**",
      "--exclude",
      ".snapshots/**",
      `${servers[0].name}:/root/`,
      "/root/",
    ],
    10 * 60,
  );

  return async () => {
    await podman([
      "exec",
      sidecarPodName,
      "mutagen",
      "sync",
      "create",
      "--name=upperdir",
      "--mode=one-way-replica",
      "--symlink-mode=posix-raw",
      join("/root", upperdir),
      `${servers[0].name}:${upperdir}`,
    ]);

    await podman([
      "exec",
      sidecarPodName,
      "mutagen",
      "sync",
      "create",
      "--name=root",
      "--mode=two-way-resolved",
      "--symlink-mode=posix-raw",
      "--ignore",
      ".local/share/overlay/**",
      "--ignore",
      ".cache/cocalc/**",
      "--ignore",
      ".mutagen-dev/**",
      "--ignore",
      ".ssh/**",
      "--ignore",
      ".snapshots/**",
      "/root",
      `${servers[0].name}:/root`,
    ]);
  };
}

export async function stop({
  project_id,
  force,
}: {
  project_id: string;
  force?: boolean;
}) {
  if (!isValidUUID(project_id)) {
    throw Error("stop: project_id must be valid");
  }
  logger.debug("stop", { project_id });
  const child = children[project_id];

  if (child != null && child.exitCode == null) {
    const v: any[] = [];
    v.push(
      podman([
        "pod",
        "rm",
        "-f",
        "-t",
        force ? "0" : `${GRACE_PERIOD / 1000}`,
        `project-${project_id}`,
      ]),
    );
    v.push(
      podman([
        "rm",
        "-f",
        "-t",
        force ? "0" : `${GRACE_PERIOD / 1000}`,
        `project-${project_id}`,
      ]),
    );
    v.push(
      podman([
        "rm",
        "-f",
        "-t",
        force ? "0" : `${GRACE_PERIOD / 1000}`,
        `sidecar-${project_id}`,
      ]),
    );
    v.push(rootFilesystem.unmount(project_id));
    delete children[project_id];
    try {
      await Promise.all(v);
    } catch (err) {
      logger.debug("stop", { err });
    }
  }
}

async function podman(args: string[], timeout?) {
  logger.debug("podman ", args.join(" "));
  return await executeCode({
    verbose: true,
    command: "podman",
    args,
    err_on_exit: true,
    timeout,
  });
}

async function state(project_id): Promise<ProjectState> {
  if (children[project_id] != null && children[project_id].exitCode == null) {
    return "running";
  }
  const name = `project-${project_id}`;
  const { stdout } = await podman([
    "ps",
    "--filter",
    `name=${name}`,
    "--format",
    "{{.Names}} {{.State}}",
  ]);
  let status = "";
  for (const x of stdout.split("\n")) {
    const v = x.split(" ");
    if (v[0] == name) {
      status = v[1].trim();
      break;
    }
  }
  return status == "running" ? "running" : "opened";
}

export async function status({ project_id, localPath }) {
  if (!isValidUUID(project_id)) {
    throw Error("status: project_id must be valid");
  }
  logger.debug("status", { project_id });
  const s = await state(project_id);
  let publicKey: string | undefined = undefined;
  const home = await localPath({ project_id });
  try {
    publicKey = await readFile(join(home, ".ssh", "id_ed25519.pub"), "utf8");
  } catch {}
  return { state: s, ip: "127.0.0.1", publicKey };
}

export async function close() {
  const v: any[] = [];
  for (const project_id in children) {
    logger.debug(`killing project_id=${project_id}`);
    v.push(stop({ project_id, force: true }));
    delete children[project_id];
  }
  await Promise.all(v);
}

/**
 * If the image name is unqualified, prepend "docker.io/".
 * Otherwise, return it unchanged.  We do this so that we
 * don't have to modify the configuration of podman at all,
 * and ALSO to keep things as canonical as possible.
 */
function isQualified(name) {
  const firstSlash = name.indexOf("/");
  if (firstSlash === -1) return false; // no slash => unqualified
  const first = name.slice(0, firstSlash);
  return first === "localhost" || first.includes(".") || first.includes(":");
}

function normalizeImageName(name) {
  return isQualified(name) ? name : `docker.io/${name}`;
}

export function getImage(config?: Configuration): string {
  const image = config?.image?.trim();
  return normalizeImageName(image ? image : DEFAULT_PROJECT_IMAGE);
}

// important because it kills all
// the processes that were spawned
process.once("exit", close);
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
