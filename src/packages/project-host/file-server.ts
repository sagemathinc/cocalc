// Minimal file-server for project-host.
// This allows users to browse and generally use the filesystem of any project,
// without having to run that project.

import { dirname, join } from "node:path";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import {
  server as createFileServer,
  client as createFileClient,
  type Fileserver,
  type CopyOptions,
  type SnapshotUsage,
  type Sync,
} from "@cocalc/conat/files/file-server";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import {
  data,
  fileServerMountpoint,
  secrets,
  rusticRepo,
} from "@cocalc/backend/data";
import { filesystem, type Filesystem } from "@cocalc/file-server/btrfs";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { type SnapshotCounts } from "@cocalc/util/db-schema/projects";
import { init as initSshServer } from "@cocalc/project-proxy/ssh-server";
import { type MutagenSyncSession } from "@cocalc/conat/project/mutagen/types";
import { fsServer, DEFAULT_FILE_SERVICE } from "@cocalc/conat/files/fs";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import { isValidUUID } from "@cocalc/util/misc";
import { getProject } from "./sqlite/projects";
import { INTERNAL_SSH_CONFIG } from "@cocalc/conat/project/runner/constants";
import { ensureHostContainer } from "./ssh/host-container";
import { ensureBtrfsContainer } from "./ssh/btrfs-container";
import { ensureHostKey } from "./ssh/host-key";
import { ensureSshpiperdKey } from "./ssh/sshpiperd-key";
import { getHostPublicKey } from "./ssh/host-keys";
import { getLocalHostId } from "./sqlite/hosts";

type SshTarget =
  | { type: "project"; project_id: string }
  | { type: "host"; host_id: string }
  | { type: "btrfs"; host_id: string };

const logger = getLogger("project-host:file-server");

function volName(project_id: string) {
  return `project-${project_id}`;
}

function requireHostId(): string {
  const id = getLocalHostId();
  if (!id) {
    throw Error("project-host id not set");
  }
  return id;
}

let fs: Filesystem | null = null;

function projectIdFromSubject(subject: string): string {
  const parts = subject.split(".");
  if (parts.length !== 2) {
    throw Error("subject must have 2 segments");
  }
  const raw = parts[1];
  if (!raw.startsWith("project-")) {
    throw Error("second segment must start with 'project-'");
  }
  const project_id = raw.slice("project-".length);
  if (!isValidUUID(project_id)) {
    throw Error("not a valid project id");
  }
  return project_id;
}

export async function getVolume(project_id: string) {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  return await fs.subvolumes.get(volName(project_id));
}

export function getMountPoint(): string {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  return fs.opts.mount;
}

function getFileSync() {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  return fs.fileSync;
}

async function mount({
  project_id,
}: {
  project_id: string;
}): Promise<{ path: string }> {
  logger.debug("mount", { project_id });
  const { path } = await getVolume(project_id);
  return { path };
}

async function clone({
  project_id,
  src_project_id,
}: {
  project_id: string;
  src_project_id: string;
}): Promise<void> {
  logger.debug("clone", { project_id });

  if (fs == null) {
    throw Error("file server not initialized");
  }
  await fs.subvolumes.clone(volName(src_project_id), volName(project_id));
}

async function getUsage({ project_id }: { project_id: string }): Promise<{
  size: number;
  used: number;
  free: number;
}> {
  logger.debug("getUsage", { project_id });
  const vol = await getVolume(project_id);
  return await vol.quota.usage();
}

async function getQuota({ project_id }: { project_id: string }): Promise<{
  size: number;
  used: number;
}> {
  logger.debug("getQuota", { project_id });
  const vol = await getVolume(project_id);
  return await vol.quota.get();
}

async function setQuota({
  project_id,
  size,
}: {
  project_id: string;
  size: number | string;
}): Promise<void> {
  logger.debug("setQuota", { project_id });
  const vol = await getVolume(project_id);
  await vol.quota.set(size);
}

async function cp({
  src,
  dest,
  options,
}: {
  // src paths are relative to the src volume
  src: { project_id: string; path: string | string[] };
  // dest path is relative to the dest volume
  dest: { project_id: string; path: string };
  options?: CopyOptions;
}): Promise<void> {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  const srcVolume = await getVolume(src.project_id);
  const destVolume = await getVolume(dest.project_id);
  let srcPaths = await srcVolume.fs.safeAbsPaths(src.path);
  let destPath = await destVolume.fs.safeAbsPath(dest.path);

  const toRelative = (path: string) => {
    if (!path.startsWith(fs!.subvolumes.fs.path)) {
      throw Error("bug");
    }
    return path.slice(fs!.subvolumes.fs.path.length + 1);
  };
  srcPaths = srcPaths.map(toRelative);
  destPath = toRelative(destPath);
  // Always reflink on btrfs.
  await fs.subvolumes.fs.cp(
    typeof src.path == "string" ? srcPaths[0] : srcPaths, // preserve string vs array
    destPath,
    { ...options, reflink: true },
  );
}

// Snapshots
async function createSnapshot({
  project_id,
  name,
  limit,
  readOnly = true,
}: {
  project_id: string;
  name?: string;
  limit?: number;
  readOnly?: boolean;
}) {
  const vol = await getVolume(project_id);
  await vol.snapshots.create(name, { limit, readOnly });
}

async function deleteSnapshot({
  project_id,
  name,
}: {
  project_id: string;
  name: string;
}) {
  const vol = await getVolume(project_id);
  await vol.snapshots.delete(name);
}

async function updateSnapshots({
  project_id,
  counts,
  limit,
}: {
  project_id: string;
  counts?: Partial<SnapshotCounts>;
  limit?: number;
}): Promise<void> {
  const vol = await getVolume(project_id);
  await vol.snapshots.update(counts, { limit });
}

async function allSnapshotUsage({
  project_id,
}: {
  project_id: string;
}): Promise<SnapshotUsage[]> {
  const vol = await getVolume(project_id);
  return await vol.snapshots.allUsage();
}

// Rustic backups
async function createBackup({
  project_id,
  limit,
}: {
  project_id: string;
  limit?: number;
}): Promise<{ time: Date; id: string }> {
  const vol = await getVolume(project_id);
  return await vol.rustic.backup({ limit });
}

async function restoreBackup({
  project_id,
  id,
  path,
  dest,
}: {
  project_id: string;
  id: string;
  path?: string;
  dest?: string;
}): Promise<void> {
  const vol = await getVolume(project_id);
  await vol.rustic.restore({ id, path, dest });
}

async function deleteBackup({
  project_id,
  id,
}: {
  project_id: string;
  id: string;
}): Promise<void> {
  const vol = await getVolume(project_id);
  await vol.rustic.forget({ id });
}

async function updateBackups({
  project_id,
  counts,
  limit,
}: {
  project_id: string;
  counts?: Partial<SnapshotCounts>;
  limit?: number;
}): Promise<void> {
  const vol = await getVolume(project_id);
  await vol.rustic.update(counts, { limit });
}

async function getBackups({ project_id }: { project_id: string }): Promise<
  {
    id: string;
    time: Date;
  }[]
> {
  const vol = await getVolume(project_id);
  return await vol.rustic.snapshots();
}

async function getBackupFiles({
  project_id,
  id,
}: {
  project_id: string;
  id: string;
}): Promise<string[]> {
  const vol = await getVolume(project_id);
  return await vol.rustic.ls({ id });
}

// File Sync
async function createSync(sync: Sync & { ignores?: string[] }): Promise<void> {
  await getFileSync().create(sync);
}

async function syncCommand(
  command: "flush" | "reset" | "pause" | "resume" | "terminate",
  sync: Sync,
): Promise<{ stdout: string; stderr: string; exit_code: number }> {
  return await getFileSync().command(command, sync);
}

async function getAllSyncs(opts: {
  name: string;
}): Promise<(Sync & MutagenSyncSession)[]> {
  return await getFileSync().getAll(opts);
}

async function getSync(
  sync: Sync,
): Promise<undefined | (Sync & MutagenSyncSession)> {
  return await getFileSync().get(sync);
}

export async function initFsServer({
  client,
  service = DEFAULT_FILE_SERVICE,
}: {
  client: ConatClient;
  service?: string;
}) {
  return await fsServer({
    service,
    client,
    fs: async (subject?: string) => {
      if (!subject) {
        throw Error("fsServer requires subject");
      }
      const project_id = projectIdFromSubject(subject);
      const { path } = await getVolume(project_id);
      return new SandboxedFilesystem(path, { host: project_id });
    },
  });
}

let servers: null | { ssh: any; file: any } = null;

export async function initFileServer({
  client,
  enableSsh = process.env.COCALC_SSH_SERVER_COUNT !== "0",
}: {
  client: ConatClient;
  enableSsh?: boolean;
}) {
  if (servers != null) {
    return servers;
  }

  if (fs == null) {
    if (fileServerMountpoint) {
      fs = await filesystem({
        mount: fileServerMountpoint,
        rustic: rusticRepo,
      });
    } else {
      const imageDir = join(data, "btrfs", "image");
      const mountPoint = join(data, "btrfs", "mnt");
      if (!(await exists(imageDir))) {
        await mkdir(imageDir, { recursive: true });
      }
      if (!(await exists(mountPoint))) {
        await mkdir(mountPoint, { recursive: true });
      }
      fs = await filesystem({
        image: join(imageDir, "btrfs.img"),
        size: "25G",
        mount: mountPoint,
        rustic: rusticRepo,
      });
    }
  }

  const file = await createFileServer({
    client,
    mount: reuseInFlight(mount),
    clone,
    getUsage: reuseInFlight(getUsage),
    getQuota: reuseInFlight(getQuota),
    setQuota,
    cp,
    // backups
    createBackup: reuseInFlight(createBackup),
    restoreBackup: reuseInFlight(restoreBackup),
    deleteBackup: reuseInFlight(deleteBackup),
    updateBackups: reuseInFlight(updateBackups),
    getBackups: reuseInFlight(getBackups),
    getBackupFiles: reuseInFlight(getBackupFiles),
    // snapshots
    createSnapshot,
    deleteSnapshot,
    updateSnapshots,
    allSnapshotUsage,
    // file sync
    createSync,
    getAllSyncs,
    getSync,
    syncCommand,
  });

  let ssh: any = { close: () => {}, projectProxyHandlers: [] };
  if (enableSsh) {
    let proxyPublicKey: string | undefined;
    let hostSshPort: number | null = null;
    let btrfsSshPort: number | null = null;
    const hostId = requireHostId();
    // sshpiperd must use the stable per-host keypair persisted in sqlite.
    const sshpiperdKey = ensureSshpiperdKey(hostId);
    const hostKeyPath = join(secrets, "sshpiperd", "host_key");
    await mkdir(dirname(hostKeyPath), { recursive: true });
    await writeFile(hostKeyPath, sshpiperdKey.privateKey, { mode: 0o600 });
    await chmod(hostKeyPath, 0o600);

    async function startHostContainer() {
      if (!proxyPublicKey) {
        throw Error("proxy public key not yet available");
      }
      const hostKey = ensureHostKey(hostId).publicKey;
      const ports = await ensureHostContainer({
        path: fs!.subvolumes.fs.path,
        publicKey: proxyPublicKey,
        authorizedKeys: [proxyPublicKey, hostKey].join("\n"),
      });
      hostSshPort = ports.sshd ?? null;
      if (!hostSshPort) {
        throw Error("failed to start ssh host container -- no sshd port");
      }
    }

    async function startBtrfsServer() {
      const ports = await ensureBtrfsContainer({
        path: fs!.subvolumes.fs.path,
        publicKey: proxyPublicKey!,
      });
      btrfsSshPort = ports.sshd ?? null;
    }

    const getSshdPort = (target: SshTarget): number | null => {
      if (target.type === "project") {
        const project_id = target.project_id;
        const row = getProject(project_id);
        return row?.ssh_port ?? null;
      } else if (target.type == "host") {
        // right now there is just one container/target:
        return hostSshPort;
      } else if (target.type === "btrfs") {
        return btrfsSshPort;
      } else {
        return null;
      }
    };

    const getAuthorizedKeys = async (target: SshTarget): Promise<string> => {
      // Host-level connections: authorize only the requested host's key.
      if (target.type == "host") {
        const key = getHostPublicKey(target.host_id);
        return key?.trim() ?? "";
      }
      if (target.type === "btrfs") {
        const key = getHostPublicKey(target.host_id);
        return key?.trim() ?? "";
      }
      if (target.type != "project") {
        throw Error(
          `SshTarget type must be 'host' or 'project', but is '${(target as any).type}'`,
        );
      }

      const project_id = target.project_id;
      const keys: string[] = [];

      // Keys provided by the master (account + project keys), persisted locally.
      const row = getProject(project_id);
      if (row?.authorized_keys) {
        const trimmed = row.authorized_keys.trim();
        if (trimmed) {
          keys.push(trimmed);
        }
      }

      // Keys present inside the project filesystem.
      try {
        const { path } = await mount({ project_id });
        const managed = join(path, INTERNAL_SSH_CONFIG, "authorized_keys");
        const user = join(path, ".ssh", "authorized_keys");
        for (const candidate of [managed, user]) {
          try {
            const content = (await readFile(candidate, "utf8")).trim();
            if (content) {
              keys.push(content);
            }
          } catch {}
        }
      } catch (err) {
        logger.debug("failed to read filesystem keys", {
          project_id,
          err: `${err}`,
        });
      }

      return keys.join("\n");
    };

    ssh = await initSshServer({
      proxyHandlers: true,
      getSshdPort,
      getAuthorizedKeys,
      hostKeyPath,
    });

    proxyPublicKey = ssh.publicKey;
    try {
      await startHostContainer();
    } catch (err) {
      logger.warn("failed to start host ssh container", { err: `${err}` });
    }
    try {
      await startBtrfsServer();
    } catch (err) {
      logger.warn("failed to start btrfs ssh server", { err: `${err}` });
    }
  }

  servers = { file, ssh };
  return servers;
}

// Update the managed authorized_keys file for a project. This is used when the
// master pushes refreshed SSH keys; it does not touch the user's ~/.ssh/authorized_keys.
export async function writeManagedAuthorizedKeys(
  project_id: string,
  keys?: string,
): Promise<void> {
  const content = (keys ?? "").trim();
  const formatted = content
    ? content.endsWith("\n")
      ? content
      : `${content}\n`
    : "";
  if (!formatted) return;
  const { path } = await mount({ project_id });
  const managedPath = join(path, INTERNAL_SSH_CONFIG, "authorized_keys");
  await mkdir(join(path, INTERNAL_SSH_CONFIG), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(managedPath, formatted, { mode: 0o600 });
}

export function closeFileServer() {
  if (servers == null) {
    return;
  }
  const { file, ssh } = servers;
  servers = null;
  file.close();
  ssh.kill?.("SIGKILL");
}

let cachedClient: null | Fileserver = null;
export function fileServerClient(client: ConatClient): Fileserver {
  cachedClient ??= createFileClient({ client });
  return cachedClient!;
}
