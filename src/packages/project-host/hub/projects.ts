import { hubApi } from "@cocalc/lite/hub/api";
import { account_id } from "@cocalc/backend/data";
import { uuid, isValidUUID } from "@cocalc/util/misc";
import { getProject, upsertProject } from "../sqlite/projects";
import { type CreateProjectOptions } from "@cocalc/util/db-schema/projects";
import type { client as projectRunnerClient } from "@cocalc/conat/project/runner/run";
import {
  DEFAULT_PROJECT_IMAGE,
  DEFAULT_COMPUTE_IMAGE,
} from "@cocalc/util/db-schema/defaults";
import getLogger from "@cocalc/backend/logger";
import { reportProjectStateToMaster } from "../master-status";
import { secretsPath as sshProxySecretsPath } from "@cocalc/project-proxy/ssh-server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeManagedAuthorizedKeys, getVolume } from "../file-server";
import { INTERNAL_SSH_CONFIG } from "@cocalc/conat/project/runner/constants";
import type { Configuration } from "@cocalc/conat/project/runner/types";
import { ensureHostKey } from "../ssh/host-key";
import { getHostPublicKey, getSshpiperdPublicKey } from "../ssh/host-keys";
import { getLocalHostId } from "../sqlite/hosts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { argsJoin } from "@cocalc/util/args";

const logger = getLogger("project-host:hub:projects");
const MB = 1_000_000;
const DEFAULT_PID_LIMIT = 4096;

function normalizeRunQuota(run_quota?: any): any | undefined {
  if (run_quota == null) return undefined;
  if (typeof run_quota === "string") {
    try {
      return JSON.parse(run_quota);
    } catch {
      return undefined;
    }
  }
  if (typeof run_quota === "object") {
    return run_quota;
  }
  return undefined;
}

function runnerConfigFromQuota(run_quota?: any): Partial<Configuration> {
  const limits: Partial<Configuration> = {};
  if (!run_quota) return limits;

  if (run_quota.cpu_limit != null) {
    limits.cpu = run_quota.cpu_limit;
  }

  if (run_quota.memory_limit != null) {
    const memory = Math.floor(run_quota.memory_limit * MB);
    limits.memory = memory;
    limits.tmp = Math.floor(memory / 2);
    limits.swap = true;
  }

  if (run_quota.pids_limit != null) {
    limits.pids = run_quota.pids_limit;
  } else {
    limits.pids = DEFAULT_PID_LIMIT;
  }

  if (run_quota.disk_quota != null) {
    const disk = Math.floor(run_quota.disk_quota * MB);
    limits.disk = disk;
    limits.scratch = disk;
  }

  return limits;
}

let cachedProxyKey: string | undefined;
async function getSshProxyPublicKey(): Promise<string | undefined> {
  if (cachedProxyKey !== undefined) return cachedProxyKey;
  try {
    cachedProxyKey = await readFile(
      join(sshProxySecretsPath(), "id_ed25519.pub"),
      "utf8",
    );
  } catch (err) {
    logger.warn("unable to read ssh proxy public key", { err: `${err}` });
    cachedProxyKey = undefined;
  }
  return cachedProxyKey;
}

type RunnerApi = ReturnType<typeof projectRunnerClient>;

// **TODO: This normalizeImage is VERY VERY TEMPORARY!!!**
// The only reason for this is the frontend by default uses the massive cocalc rootfs's
// by default, which of course aren't the name of Docker images. For now, we just
// revert them back to the the default docker image.
// We will definitely change this for the actual release.
function normalizeImage(image?: string): string {
  const trimmed = image?.trim();
  if (!trimmed) return DEFAULT_PROJECT_IMAGE;
  if (trimmed.includes(":") || trimmed.includes("/")) {
    return trimmed;
  }
  if (trimmed === DEFAULT_COMPUTE_IMAGE) {
    return DEFAULT_PROJECT_IMAGE;
  }
  // Otherwise assume it's a label meant for the old compute image list; fall back for now.
  return DEFAULT_PROJECT_IMAGE;
}

function ensureProjectRow({
  project_id,
  opts,
  state = "stopped",
  http_port,
  ssh_port,
  authorized_keys,
}: {
  project_id: string;
  opts?: CreateProjectOptions;
  state?: string;
  http_port?: number;
  ssh_port?: number;
  authorized_keys?: string;
}) {
  logger.debug("ensureProjectRow", {
    project_id,
    opts,
    state,
    http_port,
    ssh_port,
    authorized_keys,
  });
  const now = Date.now();
  const row: any = {
    project_id,
    state,
    updated_at: now,
    last_seen: now,
  };
  const run_quota = normalizeRunQuota((opts as any)?.run_quota);
  if (run_quota) {
    row.run_quota = run_quota;
    if (run_quota.disk_quota != null) {
      const disk = Math.floor(run_quota.disk_quota * MB);
      row.disk = disk;
      row.scratch = disk;
    }
  }
  if (http_port !== undefined) {
    row.http_port = http_port;
  }
  if (ssh_port !== undefined) {
    row.ssh_port = ssh_port;
  }
  if (authorized_keys !== undefined) {
    row.authorized_keys = authorized_keys;
  }
  if (opts) {
    const title = opts.title?.trim();
    if (title) {
      row.title = title;
    }
    if (opts.image !== undefined) {
      row.image = normalizeImage(opts.image);
    }
    if ((opts as any)?.users !== undefined) {
      row.users = (opts as any).users;
      // [ ] TODO -- for now we always included the default user;
      // this is obviously temporary
      row.users[account_id] = { group: "owner" };
    }
  }
  upsertProject(row);
  if (state) {
    reportProjectStateToMaster(project_id, state);
  }
}

async function runCmd(cmd: string, args: string[], opts: any = {}) {
  return await new Promise<void>((resolve, reject) => {
    logger.debug(`${cmd} ${argsJoin(args)}`);
    const child = spawn(cmd, args, opts);
    let stderr = "";
    // child.stderr defined, depends on opts: "If the child process was spawned with stdio[2] set to anything other than 'pipe', then this will be null."
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function getRunnerConfig(
  project_id: string,
  opts?: CreateProjectOptions,
) {
  const existing = getProject(project_id);
  const authorized_keys =
    (opts as any)?.authorized_keys ?? existing?.authorized_keys;
  const run_quota = normalizeRunQuota(
    (opts as any)?.run_quota ?? (existing as any)?.run_quota,
  );
  const limits = runnerConfigFromQuota(run_quota);
  const disk = limits.disk ?? existing?.disk;
  const scratch = limits.scratch ?? existing?.scratch;
  const ssh_proxy_public_key = await getSshProxyPublicKey();
  return {
    image: normalizeImage(opts?.image ?? existing?.image),
    authorized_keys,
    ssh_proxy_public_key,
    run_quota,
    ...limits,
    disk,
    scratch,
  };
}

export function wireProjectsApi(runnerApi: RunnerApi) {
  async function createProject(
    opts: CreateProjectOptions = {},
  ): Promise<string> {
    const project_id =
      opts.project_id && isValidUUID(opts.project_id)
        ? opts.project_id
        : uuid();

    ensureProjectRow({
      project_id,
      opts,
      state: "stopped",
      authorized_keys: (opts as any).authorized_keys,
    });

    if (opts.start) {
      const status = await runnerApi.start({
        project_id,
        config: await getRunnerConfig(project_id, opts),
      });
      ensureProjectRow({
        project_id,
        opts,
        state: status?.state ?? "running",
        http_port: (status as any)?.http_port,
        ssh_port: (status as any)?.ssh_port,
      });
    }

    return project_id;
  }

  async function start({
    project_id,
    authorized_keys,
    run_quota,
  }: {
    project_id: string;
    authorized_keys?: string;
    run_quota?: any;
  }): Promise<void> {
    const status = await runnerApi.start({
      project_id,
      config: await getRunnerConfig(project_id, { authorized_keys, run_quota }),
    });
    ensureProjectRow({
      project_id,
      opts: { authorized_keys, run_quota },
      state: status?.state ?? "running",
      http_port: (status as any)?.http_port,
      ssh_port: (status as any)?.ssh_port,
    });
    await refreshAuthorizedKeys(project_id, authorized_keys);
  }

  async function stop({
    project_id,
    force,
  }: {
    project_id: string;
    force?: boolean;
  }): Promise<void> {
    const status = await runnerApi.stop({ project_id, force });
    ensureProjectRow({
      project_id,
      state: status?.state ?? "stopped",
      http_port: undefined,
      ssh_port: undefined,
    });
  }

  // Create a project locally and optionally start it.
  hubApi.projects.createProject = createProject;
  hubApi.projects.start = start;
  hubApi.projects.stop = stop;
  hubApi.projects.getSshKeys = getSshKeys;
}

// Update managed SSH keys for a project without restarting it.
async function refreshAuthorizedKeys(
  project_id: string,
  authorized_keys?: string,
) {
  upsertProject({ project_id, authorized_keys });
  if (authorized_keys != null) {
    try {
      await writeManagedAuthorizedKeys(project_id, authorized_keys);
    } catch (err) {
      logger.debug("refreshAuthorizedKeys: failed to write managed keys", {
        project_id,
        err: `${err}`,
      });
    }
  }
}

// Allow the master to push refreshed SSH keys when account/project keys change.
export async function updateAuthorizedKeys({
  project_id,
  authorized_keys,
}: {
  project_id: string;
  authorized_keys?: string;
}) {
  if (!isValidUUID(project_id)) {
    throw Error("invalid project_id");
  }
  await refreshAuthorizedKeys(project_id, authorized_keys ?? "");
}

export async function getSshKeys({
  project_id,
}: {
  project_id: string;
}): Promise<string[]> {
  if (!isValidUUID(project_id)) {
    throw Error("invalid project_id");
  }

  const keys = new Set<string>();

  // Keys persisted from the master (account + project keys).
  const row = getProject(project_id);
  if (row?.authorized_keys) {
    for (const line of row.authorized_keys.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) keys.add(trimmed);
    }
  }

  // Keys present inside the project filesystem (managed + user).
  try {
    const { path } = await getVolume(project_id);
    const managed = join(path, INTERNAL_SSH_CONFIG, "authorized_keys");
    const user = join(path, ".ssh", "authorized_keys");
    for (const candidate of [managed, user]) {
      try {
        const content = (await readFile(candidate, "utf8")).trim();
        if (!content) continue;
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed) keys.add(trimmed);
        }
      } catch {}
    }
  } catch (err) {
    logger.debug("getSshKeys: failed to read filesystem keys", {
      project_id,
      err: `${err}`,
    });
  }

  return Array.from(keys);
}

// this function gets run on the destination, copying
// files from the source.  This direction means that
// only the initiating side has to be writeable, which is
// a potentially more secure orientation.
export async function copyPaths({
  src,
  dest,
}: {
  src: {
    host_id: string;
    ssh_server?: string;
    project_id: string;
    paths: string[];
  };
  dest: { host_id: string; project_id: string; path: string };
}) {
  logger.debug("copyPaths", { src, dest });
  if (!isValidUUID(src.project_id) || !isValidUUID(dest.project_id)) {
    throw Error("invalid project_id");
  }
  if (!src.ssh_server) {
    throw Error("source ssh_server is required");
  }

  const destVol = await getVolume(dest.project_id);
  const destRoot = destVol.path;
  const destAbs = resolve(destRoot, dest.path);
  if (!destAbs.startsWith(destRoot)) {
    throw Error("destination path escapes project");
  }

  const srcPaths = Array.isArray(src.paths) ? src.paths : [src.paths];
  if (!srcPaths.length) {
    return;
  }

  const tmp = await mkdtemp(join(tmpdir(), "ph-rsync-"));
  const keyFile = join(tmp, "id_ed25519");
  const knownHosts = join(tmp, "known_hosts");
  try {
    const hostId = getLocalHostId();
    if (!hostId) {
      throw Error("host id not set");
    }
    const hostKey = ensureHostKey(hostId);
    await writeFile(keyFile, hostKey.privateKey, { mode: 0o600 });

    const srcHostKey = getHostPublicKey(src.host_id);
    if (!srcHostKey) {
      throw Error(`missing host key for ${src.host_id}`);
    }
    const [sshHost, sshPort] = src.ssh_server.includes(":")
      ? src.ssh_server.split(":")
      : [src.ssh_server, "22"];

    // Foor known hosts we use sshpiperd's public key for
    // the src node,  *NOT* the actual public key.
    const sshPiperdKey = getSshpiperdPublicKey(src.host_id);
    if (!sshPiperdKey) {
      throw Error(`missing sshpiperd host key for ${src.host_id}`);
    }
    await writeFile(
      knownHosts,
      `[${sshHost}]:${sshPort} ${sshPiperdKey.trim()}\n`,
      { mode: 0o600 },
    );

    const remoteBase = `/btrfs/project-${src.project_id}`;
    const sources: string[] = [];
    for (const p of srcPaths) {
      const remotePath = resolve(remoteBase, p);
      if (!remotePath.startsWith(remoteBase)) {
        throw Error(`source path escapes project: ${p}`);
      }
      sources.push(`project-host-${dest.host_id}@${sshHost}:${remotePath}`);
    }

    const sshCmd = [
      "ssh",
      "-p",
      sshPort,
      "-i",
      keyFile,
      "-o",
      "StrictHostKeyChecking=no",
      //       "StrictHostKeyChecking=yes",
      //       "-o",
      //       `UserKnownHostsFile=${knownHosts}`,
      //       "-o",
      //       "IdentitiesOnly=yes",
    ].join(" ");

    const args = ["-a", "-z", "-e", sshCmd, ...sources, destAbs];
    logger.debug("rsync copyPaths");
    await runCmd("rsync", args, { stdio: "pipe" });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
