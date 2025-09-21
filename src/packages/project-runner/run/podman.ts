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

import { nodePath } from "./mounts";
import { isValidUUID } from "@cocalc/util/misc";
import { ensureConfFilesExists, setupDataPath, writeSecretToken } from "./util";
import { getEnvironment } from "./env";
import { mkdir, readFile } from "node:fs/promises";
import { execFile as execFile0 } from "node:child_process";
import { promisify } from "node:util";
const execFile = promisify(execFile0);
import { getCoCalcMounts, COCALC_SRC } from "./mounts";
import { setQuota } from "./filesystem";
import { executeCode } from "@cocalc/backend/execute-code";
import { join } from "path";
import * as rootFilesystem from "./overlay";
import { type ProjectState } from "@cocalc/conat/project/runner/state";
import { type Configuration } from "@cocalc/conat/project/runner/types";
import { DEFAULT_PROJECT_IMAGE } from "@cocalc/util/db-schema/defaults";
import { podmanLimits } from "./limits";
import {
  init as initSidecar,
  startSidecar,
  sidecarContainerName,
} from "./sidecar";
import {
  type SshServersFunction,
  type LocalPathFunction,
} from "@cocalc/conat/project/runner/types";
import { initSshKeys } from "@cocalc/backend/ssh-keys";
import { bootlog, resetBootlog } from "@cocalc/conat/project/runner/bootlog";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("project-runner:podman");

const GRACE_PERIOD = 3000;

// projects we are definitely starting right now
const starting = new Set<string>();

// pod name format assumed in getAll below also
function projectPodName(project_id) {
  return `project-${project_id}`;
}

function projectContainerName(project_id) {
  return `project-${project_id}`;
}

export async function start({
  project_id,
  config = {},
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

  if (starting.has(project_id) || stopping.has(project_id)) {
    logger.debug("starting/stopping -- already running");
    return;
  }

  try {
    starting.add(project_id);
    resetBootlog({ project_id });
    bootlog({ project_id, type: "start", progress: 0 });

    try {
      bootlog({ project_id, type: "init-sidecar", progress: 0 });
      await initSidecar();
      bootlog({ project_id, type: "init-sidecar", progress: 100 });
    } catch (err) {
      bootlog({ project_id, type: "init-sidecar", error: err });
      throw err;
    }
    bootlog({
      project_id,
      type: "start",
      progress: 5,
      desc: "initialized sidecar",
    });

    const pod = projectPodName(project_id);
    try {
      await podman([
        "pod",
        "create",
        "--name",
        pod,
        "--label",
        `project_id=${project_id}`,
        "--network=pasta",
      ]);
    } catch (err) {
      if (!`${err}`.includes("exists")) {
        throw err;
      }
    }
    bootlog({ project_id, type: "start", progress: 10, desc: "created pod" });

    const home = await localPath({ project_id });
    logger.debug("start: got home", { project_id, home });
    bootlog({
      project_id,
      type: "start",
      progress: 10,
      desc: "got home directory",
    });
    const mounts = getCoCalcMounts();
    const image = getImage(config);
    const servers = await sshServers?.({ project_id });
    await initSshKeys({ home, sshServers: servers });
    bootlog({
      project_id,
      type: "start",
      progress: 15,
      desc: "initialized ssh keys",
    });

    const env = await getEnvironment({
      project_id,
      env: config?.env,
      HOME: "/root",
      image,
    });

    bootlog({
      project_id,
      type: "start",
      progress: 20,
      desc: "got env variables",
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
    bootlog({
      project_id,
      type: "start",
      progress: 30,
      desc: "started sync sidecar",
    });

    const rootfs = await rootFilesystem.mount({ project_id, home, config });
    bootlog({
      project_id,
      type: "start",
      progress: 40,
      desc: "mounted rootfs",
    });
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

    bootlog({
      project_id,
      type: "start",
      progress: 50,
      desc: "setup project directories",
    });

    logger.debug("start: setup data path", { project_id });
    if (config.secret) {
      await writeSecretToken(home, config.secret!);
      logger.debug("start: wrote secret", { project_id });
    }

    if (config.disk) {
      // TODO: maybe this should be done in parallel with other things
      // to make startup time slightly faster (?) -- could also be incorporated
      // into mount.
      await setQuota(project_id, config.disk!);
      logger.debug("start: set disk quota", { project_id });
    }
    bootlog({
      project_id,
      type: "start",
      progress: 80,
      desc: "configured quotas",
    });
    const args: string[] = [];
    args.push("run");
    args.push("--detach");
    args.push("--label", `project_id=${project_id}`);
    args.push("--rm");
    args.push("--replace");
    args.push("--user=0:0");
    args.push("--pod", pod);

    const cmd = "podman";
    const script = join(COCALC_SRC, "/packages/project/bin/cocalc-project.js");

    args.push("--name", projectContainerName(project_id));

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

    await execFile(cmd, args);

    bootlog({
      project_id,
      type: "start",
      progress: 100,
      desc: "started!",
    });

    // non-blocking on start since it's a background process
    (async () => {
      await initMutagen?.();
    })();
  } catch (err) {
    bootlog({ project_id, type: "start", error: err });
    throw err;
  } finally {
    starting.delete(project_id);
  }
}

// projects we are definitely stopping right now
const stopping = new Set<string>();
export async function stop({
  project_id,
  force,
}: {
  project_id?: string;
  force?: boolean;
}) {
  if (!project_id) {
    await stopAll(force);
    return;
  }
  if (!isValidUUID(project_id)) {
    throw Error(`stop: project_id '${project_id}' must be a uuid`);
  }
  logger.debug("stop", { project_id });
  if (stopping.has(project_id) || starting.has(project_id)) {
    return;
  }
  try {
    stopping.add(project_id);
    bootlog({
      project_id,
      type: "stop",
      progress: 0,
    });
    const v: any[] = [];
    v.push(
      podman([
        "pod",
        "rm",
        "-f",
        "-t",
        force ? "0" : `${GRACE_PERIOD / 1000}`,
        projectPodName(project_id),
      ]),
    );
    v.push(
      podman([
        "rm",
        "-f",
        "-t",
        force ? "0" : `${GRACE_PERIOD / 1000}`,
        projectContainerName(project_id),
      ]),
    );
    v.push(
      podman([
        "rm",
        "-f",
        "-t",
        force ? "0" : `${GRACE_PERIOD / 1000}`,
        sidecarContainerName(project_id),
      ]),
    );
    v.push(rootFilesystem.unmount(project_id));
    try {
      await Promise.all(v);
      bootlog({
        project_id,
        type: "stop",
        progress: 100,
        desc: "Fully stopped",
      });
    } catch (err) {
      logger.debug("stop", { err });
      bootlog({
        project_id,
        type: "stop",
        error: err,
      });
    }
  } finally {
    stopping.delete(project_id);
  }
}

export async function podman(args: string[], timeout?) {
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
  if (starting.has(project_id)) {
    return "starting";
  }
  if (stopping.has(project_id)) {
    return "stopping";
  }
  const { stdout } = await podman([
    "ps",
    "--pod",
    "--filter",
    `pod=${projectPodName(project_id)}`,
    "--format",
    "{{.Names}} {{.State}}",
  ]);
  const output: { [name: string]: string } = {};
  for (const x of stdout.trim().split("\n")) {
    const v = x.split(" ");
    if (v.length < 2) continue;
    output[v[0]] = v[1].trim();
  }
  if (
    output[projectContainerName(project_id)] == "running" &&
    output[sidecarContainerName(project_id)] == "running"
  ) {
    return "running";
  }
  if (Object.keys(output).length > 0) {
    // broken half-way state -- stop it asap
    await stop({ project_id, force: true });
  }
  return "opened";
}

export async function status({ project_id, localPath }) {
  if (!isValidUUID(project_id)) {
    throw Error("status: project_id must be valid");
  }
  logger.debug("status", { project_id });
  const s = await state(project_id);
  let publicKey: string | undefined = undefined;
  let error: string | undefined = undefined;
  try {
    const home = await localPath({ project_id });
    publicKey = await readFile(join(home, ".ssh", "id_ed25519.pub"), "utf8");
  } catch (err) {
    if (s != "opened") {
      error = `unable to read ssh public key of project -- ${err}`;
    }
  }
  if (error) {
    logger.debug("WARNING ", { project_id, error });
  }
  return { state: s, ip: "127.0.0.1", publicKey, error };
}

export async function getAll(): Promise<string[]> {
  const { stdout } = await podman([
    "pod",
    "ps",
    "--filter",
    `name=project-`,
    "--format",
    "{{.Name}}",
  ]);
  return stdout
    .split("\n")
    .filter(
      (x) => x.startsWith("project-") && x.length == 36 + "project-".length,
    )
    .map((x) => x.slice("project-".length));
}

async function stopAll(force) {
  const v: any[] = [];
  for (const project_id of await getAll()) {
    logger.debug(`killing project_id=${project_id}`);
    v.push(stop({ project_id, force }));
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
