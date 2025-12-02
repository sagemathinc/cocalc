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

import { mountArg } from "@cocalc/backend/podman";
import { nodePath } from "./mounts";
import { isValidUUID } from "@cocalc/util/misc";
import { ensureConfFilesExists, setupDataPath, writeSecretToken } from "./util";
import { getEnvironment } from "./env";
import { mkdir, readFile, readdir, stat, realpath } from "node:fs/promises";
import { getCoCalcMounts, COCALC_SRC } from "./mounts";
import { setQuota } from "./filesystem";
import { join, relative, isAbsolute } from "node:path";
import { mount as mountRootFs, unmount as unmountRootFs } from "./rootfs";
import { type ProjectState } from "@cocalc/conat/project/runner/state";
import { type Configuration } from "@cocalc/conat/project/runner/types";
import { DEFAULT_PROJECT_IMAGE } from "@cocalc/util/db-schema/defaults";
import { podmanLimits } from "./limits";
import {
  type LocalPathFunction,
  type SshServersFunction,
} from "@cocalc/conat/project/runner/types";
import { SSH_IDENTITY_FILE, START_PROJECT_SSH } from "@cocalc/conat/project/runner/constants";
import { bootlog, resetBootlog } from "@cocalc/conat/project/runner/bootlog";
import getLogger from "@cocalc/backend/logger";
import { writeStartupScripts } from "./startup-scripts";
import { podman } from "@cocalc/backend/podman";

const logger = getLogger("project-runner:podman");

const DEFAULT_PROJECT_SCRIPT = join(
  COCALC_SRC,
  "packages/project/bin/cocalc-project.js",
);
const PROJECT_BUNDLE_ENTRY = ["bundle", "index.js"] as const;
const PROJECT_BUNDLE_MOUNT_POINT = "/opt/cocalc/project-bundle";
const PROJECT_BUNDLE_BIN_PATH = join(PROJECT_BUNDLE_MOUNT_POINT, "bin");

// if computing status of a project shows pod is
// somehow messed up, this will cleanly kill it.  It's
// very good right now to have this on, since otherwise
// restart, etc., would be impossible. But it is annoying
// when debugging.
const STOP_ON_STATUS_ERROR = false;

// projects we are definitely starting right now
export const starting = new Set<string>();

function projectContainerName(project_id) {
  return `project-${project_id}`;
}

interface ScriptResolution {
  script: string;
  bundleMount?: { source: string; target: string };
}

function isSubPath(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (code != null) {
      return String(code);
    }
  }
  return undefined;
}

async function resolveProjectScript(): Promise<ScriptResolution> {
  const bundlesRootEnv = process.env.COCALC_PROJECT_BUNDLES;
  if (!bundlesRootEnv) {
    return { script: DEFAULT_PROJECT_SCRIPT };
  }

  let bundlesRoot: string;
  try {
    bundlesRoot = await realpath(bundlesRootEnv);
  } catch (err) {
    logger.warn("COCALC_PROJECT_BUNDLES path not accessible; falling back", {
      path: bundlesRootEnv,
      error: `${err}`,
    });
    return { script: DEFAULT_PROJECT_SCRIPT };
  }

  const resolveCandidate = async (
    candidate: string,
  ): Promise<{ path: string; mtimeMs: number } | undefined> => {
    try {
      const resolved = await realpath(candidate);
      if (!isSubPath(bundlesRoot, resolved)) {
        logger.warn("bundle candidate outside of root; ignoring", {
          candidate,
          resolved,
        });
        return undefined;
      }
      const info = await stat(resolved);
      if (!info.isDirectory()) {
        logger.warn("bundle candidate is not a directory; ignoring", {
          resolved,
        });
        return undefined;
      }
      return { path: resolved, mtimeMs: info.mtimeMs };
    } catch (err) {
      const code = getErrorCode(err);
      if (code !== "ENOENT") {
        logger.warn("failed to inspect bundle candidate; ignoring", {
          candidate,
          error: `${err}`,
        });
      }
      return undefined;
    }
  };

  let bundleDir: string | undefined;

  const currentCandidate = await resolveCandidate(join(bundlesRoot, "current"));
  if (currentCandidate != null) {
    bundleDir = currentCandidate.path;
  }

  if (bundleDir == null) {
    let newest: { path: string; mtimeMs: number } | undefined;
    let entries;
    try {
      entries = await readdir(bundlesRoot, { withFileTypes: true });
    } catch (err) {
      logger.warn("failed to read bundles directory; falling back", {
        path: bundlesRoot,
        error: `${err}`,
      });
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      const candidate = await resolveCandidate(join(bundlesRoot, entry.name));
      if (candidate == null) {
        continue;
      }
      if (newest == null || candidate.mtimeMs > newest.mtimeMs) {
        newest = candidate;
      }
    }

    if (newest != null) {
      bundleDir = newest.path;
    }
  }

  if (bundleDir == null) {
    logger.warn(
      "no suitable bundles found under COCALC_PROJECT_BUNDLES; falling back",
      { path: bundlesRoot },
    );
    return { script: DEFAULT_PROJECT_SCRIPT };
  }

  const hostScriptPath = join(bundleDir, ...PROJECT_BUNDLE_ENTRY);
  try {
    const info = await stat(hostScriptPath);
    if (!info.isFile()) {
      logger.warn("bundle entry is not a file; falling back", {
        entry: hostScriptPath,
      });
      return { script: DEFAULT_PROJECT_SCRIPT };
    }
  } catch (err) {
    logger.warn("failed to stat bundle entry; falling back", {
      entry: hostScriptPath,
      error: `${err}`,
    });
    return { script: DEFAULT_PROJECT_SCRIPT };
  }

  const containerScript = join(
    PROJECT_BUNDLE_MOUNT_POINT,
    ...PROJECT_BUNDLE_ENTRY,
  );

  logger.info("using project bundle", {
    source: bundleDir,
    script: containerScript,
  });

  return {
    script: containerScript,
    bundleMount: { source: bundleDir, target: PROJECT_BUNDLE_MOUNT_POINT },
  };
}

export async function start({
  project_id,
  config = {},
  localPath,
  sshServers: _sshServers,
}: {
  project_id: string;
  config?: Configuration;
  localPath: LocalPathFunction;
  sshServers?: SshServersFunction;
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
    bootlog({ project_id, type: "start-project", progress: 0 });

    const { home, scratch } = await localPath({
      project_id,
      disk: config?.disk,
      scratch: config?.scratch,
    });
    logger.debug("start: home and scratch", { project_id, home, scratch });
    bootlog({
      project_id,
      type: "start-project",
      progress: 5,
      desc: "got home and scratch directories",
    });

    const image = getImage(config);
    bootlog({
      project_id,
      type: "start-project",
      progress: 20,
      desc: "mounting rootfs...",
    });

    const rootfs = await mountRootFs({ project_id, home, config });
    bootlog({
      project_id,
      type: "start-project",
      progress: 40,
      desc: "mounted rootfs",
    });
    logger.debug("start: got rootfs", { project_id, rootfs });

    const { script: projectScript, bundleMount } = await resolveProjectScript();

    const mounts = getCoCalcMounts();
    if (bundleMount != null) {
      let replaced = false;
      for (const source of Object.keys(mounts)) {
        if (mounts[source] === COCALC_SRC) {
          delete mounts[source];
          replaced = true;
          break;
        }
      }
      mounts[bundleMount.source] = bundleMount.target;
      if (!replaced) {
        logger.warn(
          "expected to replace default project mount but did not find it",
          { bundleSource: bundleMount.source },
        );
      }
    }

    logger.debug("start: resolved project script", {
      project_id,
      script: projectScript,
    });
    const env = await getEnvironment({
      project_id,
      env: config?.env,
      HOME: "/root",
      image,
    });

    if (bundleMount != null) {
      env.PATH = env.PATH
        ? `${PROJECT_BUNDLE_BIN_PATH}:${env.PATH}`
        : PROJECT_BUNDLE_BIN_PATH;
    }

    bootlog({
      project_id,
      type: "start-project",
      progress: 42,
      desc: "got env variables",
    });

    await mkdir(home, { recursive: true });
    logger.debug("start: created home", { project_id });
    bootlog({
      project_id,
      type: "start-project",
      progress: 48,
      desc: "created HOME",
    });

    await ensureConfFilesExists(home);
    bootlog({
      project_id,
      type: "start-project",
      progress: 50,
      desc: "created conf files",
    });
    logger.debug("start: created conf files", { project_id });

    await writeStartupScripts(home);
    logger.debug("start: wrote startup scripts", { project_id });

    bootlog({
      project_id,
      type: "start-project",
      progress: 52,
      desc: "wrote startup scripts",
    });

    await setupDataPath(home);

    bootlog({
      project_id,
      type: "start-project",
      progress: 55,
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
      type: "start-project",
      progress: 80,
      desc: "configured quotas",
    });
    const args: string[] = [];
    args.push("run");
    //args.push("--user", "1000:1000");
    args.push("--user", "0:0");
    args.push("--detach");
    args.push("--label", `project_id=${project_id}`, "--label", `role=project`);
    args.push("--rm");
    args.push("--replace");
    args.push("--network=slirp4netns");

    const name = projectContainerName(project_id);
    args.push("--name", name);

    for (const path in mounts) {
      args.push(
        mountArg({ source: path, target: mounts[path], readOnly: true }),
      );
    }
    args.push(mountArg({ source: home, target: env.HOME }));
    if (scratch) {
      args.push(mountArg({ source: scratch, target: "/scratch" }));
    }
    if (config.tmp) {
      args.push(
        "--mount",
        `type=tmpfs,tmpfs-size=${config.tmp},tmpfs-mode=1777,destination=/tmp`,
      );
    } else if (scratch) {
      await mkdir(join(scratch, "tmp"), { recursive: true });
      args.push(mountArg({ source: join(scratch, "tmp"), target: "/tmp" }));
    }

    for (const key in env) {
      args.push("-e", `${key}=${env[key]}`);
    }

    args.push(...(await podmanLimits(config)));

    // --init = have podman inject a tiny built in init script so we don't get zombies.
    args.push("--init");

    args.push("--rootfs", rootfs);
    args.push(nodePath);
    args.push(projectScript, "--init", "project_init.sh");

    logger.debug("start: launching container - ", name);

    await podman(args);

    bootlog({
      project_id,
      type: "start-project",
      progress: 85,
      desc: "launched project container",
    });

    await initSshServer(name);
    bootlog({
      project_id,
      type: "start-project",
      progress: 100,
      desc: "started",
    });
  } catch (err) {
    bootlog({ project_id, type: "start-project", error: err });
    throw err;
  } finally {
    starting.delete(project_id);
  }
}

// projects we are definitely stopping right now
export const stopping = new Set<string>();
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
    resetBootlog({ project_id });
    bootlog({
      project_id,
      type: "stop-project",
      progress: 0,
    });

    try {
      await podman(["rm", "-f", "-t", "0", projectContainerName(project_id)]);
      await unmountRootFs(project_id);
      bootlog({
        project_id,
        type: "stop-project",
        progress: 100,
        desc: "stopped",
      });
    } catch (err) {
      logger.debug("stop", { err });
      bootlog({
        project_id,
        type: "stop-project",
        error: err,
      });
      throw err;
    }
  } finally {
    stopping.delete(project_id);
  }
}

export async function state(
  project_id: string,
  ignoreCache = false,
): Promise<ProjectState> {
  if (!ignoreCache) {
    if (starting.has(project_id)) {
      return "starting";
    }
    if (stopping.has(project_id)) {
      return "stopping";
    }
  }
  const { stdout } = await podman([
    "ps",
    "--filter",
    `name=${projectContainerName(project_id)}`,
    "--filter",
    "label=role=project",
    "--format",
    "{{.Names}} {{.State}}",
  ]);
  const output: { [name: string]: string } = {};
  for (const x of stdout.trim().split("\n")) {
    const v = x.split(" ");
    if (v.length < 2) continue;
    output[v[0]] = v[1].trim();
  }
  if (output[projectContainerName(project_id)] == "running") {
    return "running";
  }
  if (Object.keys(output).length > 0 && STOP_ON_STATUS_ERROR) {
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
    const { home } = await localPath({ project_id });
    publicKey = await readFile(join(home, SSH_IDENTITY_FILE + ".pub"), "utf8");
  } catch (err) {
    if (s != "opened") {
      error = `unable to read ssh public key of project -- ${err}`;
    }
  }
  if (error) {
    logger.debug("WARNING ", { project_id, error });
  }
  return {
    state: s,
    publicKey,
    error,
  };
}

export async function getAll(): Promise<string[]> {
  const { stdout } = await podman([
    "ps",
    "--filter",
    "label=role=project",
    "--format",
    '{{ index .Labels "project_id" }}',
  ]);
  return stdout
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length == 36);
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

export async function initSshServer(name: string) {
  await podman(["exec", name, "bash", "-c", join("/root", START_PROJECT_SSH)]);
}

// Placeholder: saving is a no-op now that sync sidecars are gone.
export async function save(_opts: {
  project_id: string;
  rootfs?: boolean;
  home?: boolean;
}): Promise<void> {
  return;
}
