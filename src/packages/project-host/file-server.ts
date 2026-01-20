// Minimal file-server for project-host.
// This allows users to browse and generally use the filesystem of any project,
// without having to run that project.

import { dirname, join } from "node:path";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  server as createFileServer,
  client as createFileClient,
  type Fileserver,
  type CopyOptions,
  type LroRef,
  type RestoreMode,
  type RestoreStagingHandle,
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
import {
  BACKUP_INDEX_LABEL_PREFIX,
  backupIndexDir,
  backupIndexFileName,
  backupIndexHost,
} from "@cocalc/file-server/btrfs/backup-index";
import {
  beginRestoreStaging as beginRestoreStagingBtrfs,
  ensureRestoreStaging as ensureRestoreStagingBtrfs,
  finalizeRestoreStaging as finalizeRestoreStagingBtrfs,
  releaseRestoreStaging as releaseRestoreStagingBtrfs,
  cleanupRestoreStaging as cleanupRestoreStagingBtrfs,
} from "@cocalc/file-server/btrfs/restore-staging";
import { isBtrfsSubvolume } from "@cocalc/file-server/btrfs/subvolume";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { type SnapshotCounts } from "@cocalc/util/db-schema/projects";
import { init as initSshServer } from "@cocalc/project-proxy/ssh-server";
import { type MutagenSyncSession } from "@cocalc/conat/project/mutagen/types";
import { fsServer, DEFAULT_FILE_SERVICE } from "@cocalc/conat/files/fs";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import { parseOutput } from "@cocalc/backend/sandbox/exec";
import rustic from "@cocalc/backend/sandbox/rustic";
import { isValidUUID } from "@cocalc/util/misc";
import { getProject } from "./sqlite/projects";
import { INTERNAL_SSH_CONFIG } from "@cocalc/conat/project/runner/constants";
import { ensureSshpiperdKey } from "./ssh/sshpiperd-key";
import { getLocalHostId } from "./sqlite/hosts";
import { setContainerFileIO } from "@cocalc/lite/hub/acp/executor/container";
import {
  readFile as nodeReadFile,
  writeFile as nodeWriteFile,
  open as nodeOpen,
  realpath as nodeRealpath,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { getMasterConatClient, queueProjectProvisioned } from "./master-status";
import callHub from "@cocalc/conat/hub/call-hub";
import {
  createRusticProgressHandler,
  type RusticProgressUpdate,
} from "@cocalc/file-server/btrfs/rustic-progress";
import { publishLroEvent } from "@cocalc/conat/lro/stream";
import { touchProjectLastEdited } from "./last-edited";

type SshTarget = { type: "project"; project_id: string };

const logger = getLogger("project-host:file-server");
const RESTORE_STAGING_ROOT = ".restore-staging";
const MAX_TEXT_PREVIEW_BYTES = 10 * 1024 * 1024;

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
  const vol = await fs.subvolumes.get(volName(project_id));
  if (!(await exists(vol.path))) {
    throw new Error(`project volume does not exist: ${vol.path}`);
  }
  const isSubvolume = await isBtrfsSubvolume(vol.path);
  if (!isSubvolume) {
    throw new Error(`project volume is not a btrfs subvolume: ${vol.path}`);
  }
  return vol;
}

export async function ensureVolume(project_id: string) {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  const vol = await fs.subvolumes.ensure(volName(project_id));
  queueProjectProvisioned(project_id, true);
  return vol;
}

export async function deleteVolume(project_id: string) {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  const vol = await fs.subvolumes.get(volName(project_id));
  if (!(await exists(vol.path))) {
    queueProjectProvisioned(project_id, false);
    await deleteBackupIndexCache(project_id);
    return;
  }
  try {
    const snapshots = await vol.snapshots.readdir();
    for (const name of snapshots) {
      await vol.snapshots.delete(name);
    }
  } catch (err) {
    logger.warn("deleteVolume: snapshot cleanup failed", {
      project_id,
      err: `${err}`,
    });
  }
  await fs.subvolumes.delete(volName(project_id));
  queueProjectProvisioned(project_id, false);
  await deleteBackupIndexCache(project_id);
}

async function getVolumeUnchecked(project_id: string) {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  return await fs.subvolumes.get(volName(project_id));
}

async function getVolumeForBackup(project_id: string) {
  const vol = await getVolumeUnchecked(project_id);
  // Safe to override: each Subvolume owns its SandboxedFilesystem instance.
  vol.fs.rusticRepo = await resolveRusticRepo(project_id);
  return vol;
}

export function getMountPoint(): string {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  return fs.opts.mount;
}

export async function listProvisionedProjects(): Promise<string[]> {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  const names = await fs.subvolumes.list();
  const ids = new Set<string>();
  for (const name of names) {
    if (!name.startsWith("project-")) continue;
    const project_id = name.slice("project-".length);
    if (!isValidUUID(project_id)) continue;
    ids.add(project_id);
  }
  return Array.from(ids);
}

function getFileSync() {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  return fs.fileSync;
}

function projectMountpoint(project_id: string): string {
  return join(getMountPoint(), `project-${project_id}`);
}

function isSubPath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

const backupConfigCache = new Map<
  string,
  { toml: string; expiresAt: number; path: string }
>();
let backupConfigInvalidationSub: any = null;

async function startBackupConfigInvalidation(client: ConatClient) {
  if (backupConfigInvalidationSub) return;
  const hostId = getLocalHostId();
  if (!hostId) return;
  const subject = `project-host.${hostId}.backup.invalidate`;
  backupConfigInvalidationSub = await client.subscribe(subject);
  (async () => {
    for await (const _msg of backupConfigInvalidationSub) {
      backupConfigCache.clear();
      try {
        // Refresh on demand; we only clear cache here.
      } catch (err) {
        logger.warn("backup config refresh failed", err);
      }
    }
  })().catch((err) =>
    logger.error("backup config invalidation loop failed", err),
  );
}

async function fetchBackupConfig(project_id: string): Promise<{
  toml: string;
  ttl_seconds: number;
} | null> {
  logger.debug("fetchBackupConfig", { project_id });
  const client = getMasterConatClient();
  if (!client) {
    logger.debug("ERROR: master");
    throw Error(
      "master conat client must be configured before calling fetchBackupConfig",
    );
  }
  void startBackupConfigInvalidation(client);
  if (!client) return null;
  const hostId = getLocalHostId();
  if (!hostId) return null;
  return await callHub({
    client,
    host_id: hostId,
    name: "hosts.getBackupConfig",
    args: [{ project_id }],
    timeout: 30000,
  });
}

async function reportBackupSuccess(
  project_id: string,
  time: Date,
): Promise<void> {
  const client = getMasterConatClient();
  if (!client) {
    logger.warn("backup success not reported: master conat client missing", {
      project_id,
    });
    return;
  }
  const hostId = getLocalHostId();
  if (!hostId) return;
  await callHub({
    client,
    host_id: hostId,
    name: "hosts.recordProjectBackup",
    args: [{ project_id, time }],
    timeout: 30000,
  });
}

async function ensureBackupConfig(project_id: string): Promise<string | null> {
  logger.debug("ensureBackupConfig", { project_id });
  const profilePath = join(secrets, "rustic", `project-${project_id}.toml`);
  const profileDir = path.dirname(profilePath);
  const now = Date.now();
  const cached = backupConfigCache.get(project_id);
  if (cached && now < cached.expiresAt) {
    return cached.path;
  }
  const retryDelayMs = 5000;
  while (true) {
    try {
      const remoteConfig = await fetchBackupConfig(project_id);
      const toml = remoteConfig?.toml;
      if (!toml) return null;
      const ttlSeconds = remoteConfig?.ttl_seconds ?? 0;
      backupConfigCache.set(project_id, {
        toml,
        expiresAt: ttlSeconds > 0 ? now + ttlSeconds * 1000 : now + 3600 * 1000,
        path: profilePath,
      });
      await mkdir(profileDir, { recursive: true });
      await writeFile(profilePath, toml, "utf8");
      await chmod(profilePath, 0o600);
      return profilePath;
    } catch (err) {
      logger.warn("backup config fetch failed; retrying", err);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

export async function resolveRusticRepo(project_id?: string): Promise<string> {
  if (!project_id) return rusticRepo;
  const profilePath = await ensureBackupConfig(project_id);
  if (!profilePath) {
    throw new Error(`missing backup config for project ${project_id}`);
  }
  return profilePath;
}

// Map a container path (relative to /root) to an absolute host path inside the
// project's btrfs subvolume. Throws if the path escapes the project root.
// Returns both the resolved path and the project base for additional checks.
function projectHostPath(
  project_id: string,
  containerPath: string,
): { hostPath: string; base: string } {
  // absolute host path to project root
  const base = projectMountpoint(project_id);
  const rel = path.posix.isAbsolute(containerPath)
    ? path.posix.relative("/root", containerPath)
    : containerPath;
  const joined = path.normalize(path.join(base, rel));
  if (!joined.startsWith(base)) {
    throw Error(`path escapes project root: ${containerPath}`);
  }
  return { hostPath: joined, base };
}

async function mount({
  project_id,
}: {
  project_id: string;
}): Promise<{ path: string }> {
  logger.debug("mount", { project_id });
  return { path: projectMountpoint(project_id) };
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
  queueProjectProvisioned(project_id, true);
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
  void touchProjectLastEdited(dest.project_id, "cp");
}

// Snapshots
async function createSnapshot({
  project_id,
  name,
  limit,
}: {
  project_id: string;
  name?: string;
  limit?: number;
}) {
  const vol = await getVolume(project_id);
  await vol.snapshots.create(name, { limit });
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

function createLroRusticReporter(
  lro: LroRef | undefined,
  phase: string,
): ((update: RusticProgressUpdate) => void) | undefined {
  if (!lro) return undefined;
  const start = Date.now();
  return (update: RusticProgressUpdate) => {
    const ts = Date.now();
    const detail = { ...(update.detail ?? {}) };
    if (detail.elapsed == null) {
      detail.elapsed = ts - start;
    }
    void publishLroEvent({
      scope_type: lro.scope_type,
      scope_id: lro.scope_id,
      op_id: lro.op_id,
      event: {
        type: "progress",
        ts,
        phase,
        message: update.message,
        progress: update.progress,
        detail: Object.keys(detail).length ? detail : undefined,
      },
    }).catch(() => {});
  };
}

const BACKUP_INDEX_SYNC_TTL_MS = 30_000;

interface BackupIndexManifest {
  updated_at?: string;
  entries: Record<string, { snapshot_id: string; file: string }>;
}

const backupIndexSyncState = new Map<
  string,
  { inFlight?: Promise<BackupIndexManifest>; lastSync?: number }
>();

function backupIndexManifestPath(project_id: string) {
  return join(backupIndexDir(project_id), "index-cache.json");
}

async function loadBackupIndexManifest(
  project_id: string,
): Promise<BackupIndexManifest> {
  const manifestPath = backupIndexManifestPath(project_id);
  if (!(await exists(manifestPath))) {
    return { entries: {} };
  }
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.entries && typeof parsed.entries === "object") {
      return parsed;
    }
  } catch (err) {
    logger.warn("backup index manifest parse failed", { project_id, err });
  }
  return { entries: {} };
}

async function saveBackupIndexManifest(
  project_id: string,
  manifest: BackupIndexManifest,
): Promise<void> {
  const manifestPath = backupIndexManifestPath(project_id);
  manifest.updated_at = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
}

async function recordBackupIndexLocal({
  project_id,
  backup_id,
  snapshot_id,
}: {
  project_id: string;
  backup_id: string;
  snapshot_id?: string;
}): Promise<void> {
  const file = backupIndexFileName(backup_id);
  const filePath = join(backupIndexDir(project_id), file);
  if (!(await exists(filePath))) {
    return;
  }
  const manifest = await loadBackupIndexManifest(project_id);
  manifest.entries[backup_id] = {
    snapshot_id: snapshot_id ?? "local",
    file,
  };
  await saveBackupIndexManifest(project_id, manifest);
}

function parseBackupIdFromLabel(label?: string): string | null {
  if (!label) return null;
  const match = label.match(/backup-id=([0-9a-f-]+)/i);
  return match?.[1] ?? null;
}

async function listBackupIndexSnapshots(project_id: string): Promise<
  {
    backup_id: string;
    snapshot_id: string;
    time: Date;
  }[]
> {
  const repo = await resolveRusticRepo(project_id);
  const { stdout } = parseOutput(
    await rustic(["snapshots", "--json"], {
      repo,
      host: backupIndexHost(project_id),
    }),
  );
  const raw = JSON.parse(stdout);
  const groups = Array.isArray(raw) ? raw : [];
  const snapshots: any[] = [];
  for (const group of groups) {
    const groupSnapshots = group?.snapshots ?? group?.[1] ?? [];
    if (Array.isArray(groupSnapshots)) {
      snapshots.push(...groupSnapshots);
    }
  }
  return snapshots
    .map((snap) => {
      const backup_id = parseBackupIdFromLabel(snap.label);
      if (!backup_id || !snap.id || !snap.time) return null;
      return {
        backup_id,
        snapshot_id: snap.id,
        time: new Date(snap.time),
      };
    })
    .filter(
      (snap): snap is { backup_id: string; snapshot_id: string; time: Date } =>
        snap != null,
    );
}

async function restoreBackupIndexSnapshot(
  project_id: string,
  snapshot_id: string,
): Promise<void> {
  const repo = await resolveRusticRepo(project_id);
  const dir = backupIndexDir(project_id);
  await mkdir(dir, { recursive: true });
  const indexFs = new SandboxedFilesystem(dir, {
    host: backupIndexHost(project_id),
    rusticRepo: repo,
  });
  await indexFs.rustic(["restore", snapshot_id, "."], {
    timeout: 30 * 60 * 1000,
    cwd: ".",
  });
}

async function forgetBackupIndexSnapshot(
  project_id: string,
  snapshot_id: string,
): Promise<void> {
  const repo = await resolveRusticRepo(project_id);
  await rustic(["forget", snapshot_id], {
    repo,
    host: backupIndexHost(project_id),
    timeout: 30 * 60 * 1000,
  });
}

async function syncBackupIndexCache(
  project_id: string,
  opts?: { backupIds?: Set<string>; force?: boolean },
): Promise<BackupIndexManifest> {
  const state = backupIndexSyncState.get(project_id) ?? {};
  if (!opts?.force && state.lastSync) {
    const age = Date.now() - state.lastSync;
    if (age < BACKUP_INDEX_SYNC_TTL_MS) {
      return await loadBackupIndexManifest(project_id);
    }
  }
  if (state.inFlight) {
    return await state.inFlight;
  }
  const task = (async () => {
    await mkdir(backupIndexDir(project_id), { recursive: true });
    const manifest = await loadBackupIndexManifest(project_id);
    let remote: {
      backup_id: string;
      snapshot_id: string;
      time: Date;
    }[] = [];
    try {
      remote = await listBackupIndexSnapshots(project_id);
    } catch (err) {
      logger.warn("backup index snapshot listing failed", { project_id, err });
      return manifest;
    }
    if (opts?.backupIds) {
      const allowed = opts.backupIds;
      const filtered: typeof remote = [];
      for (const entry of remote) {
        if (allowed.has(entry.backup_id)) {
          filtered.push(entry);
          continue;
        }
        try {
          await forgetBackupIndexSnapshot(project_id, entry.snapshot_id);
        } catch (err) {
          logger.warn("backup index snapshot cleanup failed", {
            project_id,
            snapshot_id: entry.snapshot_id,
            err,
          });
        }
      }
      remote = filtered;
    }
    const remoteByBackup = new Map<string, (typeof remote)[number]>();
    for (const entry of remote) {
      remoteByBackup.set(entry.backup_id, entry);
    }

    for (const [backup_id, entry] of remoteByBackup.entries()) {
      const file = backupIndexFileName(backup_id);
      const filePath = join(backupIndexDir(project_id), file);
      const manifestEntry = manifest.entries[backup_id];
      if (
        manifestEntry?.snapshot_id === entry.snapshot_id &&
        (await exists(filePath))
      ) {
        continue;
      }
      await restoreBackupIndexSnapshot(project_id, entry.snapshot_id);
      manifest.entries[backup_id] = { snapshot_id: entry.snapshot_id, file };
    }

    for (const backup_id of Object.keys(manifest.entries)) {
      if (remoteByBackup.has(backup_id)) continue;
      const entry = manifest.entries[backup_id];
      if (entry?.file) {
        await rm(join(backupIndexDir(project_id), entry.file), {
          force: true,
        });
      }
      delete manifest.entries[backup_id];
    }

    await saveBackupIndexManifest(project_id, manifest);
    return manifest;
  })();
  state.inFlight = task;
  backupIndexSyncState.set(project_id, state);
  try {
    const result = await task;
    state.lastSync = Date.now();
    return result;
  } finally {
    state.inFlight = undefined;
  }
}

async function removeBackupIndexLocal(
  project_id: string,
  backup_id: string,
): Promise<void> {
  const manifest = await loadBackupIndexManifest(project_id);
  const entry = manifest.entries[backup_id];
  if (entry?.file) {
    await rm(join(backupIndexDir(project_id), entry.file), { force: true });
  }
  if (backup_id in manifest.entries) {
    delete manifest.entries[backup_id];
    await saveBackupIndexManifest(project_id, manifest);
  }
}

export async function deleteBackupIndexCache(project_id: string) {
  await rm(backupIndexDir(project_id), { recursive: true, force: true });
  backupIndexSyncState.delete(project_id);
}

async function findBackupFilesIndexed({
  project_id,
  glob,
  iglob,
  path: scopePath,
  ids,
}: {
  project_id: string;
  glob?: string[];
  iglob?: string[];
  path?: string;
  ids?: string[];
}): Promise<
  {
    id: string;
    time: Date;
    path: string;
    isDir: boolean;
    mtime: number;
    size: number;
  }[]
> {
  await syncBackupIndexCache(project_id);
  const dir = backupIndexDir(project_id);
  const files = (await readdir(dir).catch(() => []))
    .filter((name) => name.endsWith(".sqlite"))
    .map((name) => join(dir, name));
  if (!files.length) return [];

  const scope = scopePath?.replace(/^\/+/, "").replace(/^\.\/+/, "") ?? "";
  const scoped = (entryPath: string) => {
    if (!scope) return true;
    if (entryPath === scope) return true;
    return entryPath.startsWith(`${scope}/`);
  };

  const allowedIds = ids?.length ? new Set(ids) : null;
  const results: {
    id: string;
    time: Date;
    path: string;
    isDir: boolean;
    mtime: number;
    size: number;
  }[] = [];

  for (const dbPath of files) {
    const db = new DatabaseSync(dbPath);
    const metaRows = db.prepare("SELECT key, value FROM meta").all();
    const meta = Object.fromEntries(
      metaRows.map((row: { key: string; value: string }) => [
        row.key,
        row.value,
      ]),
    );
    const backupId = meta.backup_id;
    const backupTime = meta.backup_time ? new Date(meta.backup_time) : null;
    if (!backupId || !backupTime || (allowedIds && !allowedIds.has(backupId))) {
      db.close();
      continue;
    }
    const seen = new Set<string>();
    const addRows = (rows: any[]) => {
      for (const row of rows) {
        if (!row?.path || seen.has(row.path) || !scoped(row.path)) continue;
        seen.add(row.path);
        results.push({
          id: backupId,
          time: backupTime,
          path: row.path,
          isDir: row.type === "d",
          mtime: row.mtime ?? 0,
          size: row.size ?? 0,
        });
      }
    };
    const pathExpr =
      "CASE WHEN parent = '' THEN name ELSE parent || '/' || name END";
    if (glob?.length) {
      const clauses = glob.map(() => `${pathExpr} GLOB ?`).join(" OR ");
      const stmt = db.prepare(
        `SELECT ${pathExpr} AS path, type, size, mtime FROM files WHERE ${clauses}`,
      );
      addRows(stmt.all(...glob));
    }
    if (iglob?.length) {
      const clauses = iglob.map(() => `LOWER(${pathExpr}) GLOB ?`).join(" OR ");
      const stmt = db.prepare(
        `SELECT ${pathExpr} AS path, type, size, mtime FROM files WHERE ${clauses}`,
      );
      addRows(stmt.all(...iglob.map((pattern) => pattern.toLowerCase())));
    }
    db.close();
  }
  return results;
}

async function getBackupFilesIndexed({
  project_id,
  id,
  path: subpath,
}: {
  project_id: string;
  id: string;
  path?: string;
}): Promise<{ name: string; isDir: boolean; mtime: number; size: number }[]> {
  await syncBackupIndexCache(project_id);
  const manifest = await loadBackupIndexManifest(project_id);
  const entry = manifest.entries[id];
  if (!entry) return [];
  const dbPath = join(backupIndexDir(project_id), entry.file);
  if (!(await exists(dbPath))) return [];
  const parent =
    (subpath ?? "").replace(/^\/+/, "").replace(/^\.\/+/, "") ?? "";
  const db = new DatabaseSync(dbPath);
  try {
    const rows = db
      .prepare(
        "SELECT name, type, size, mtime FROM files WHERE parent = ? ORDER BY name",
      )
      .all(parent);
    return rows.map((row: any) => ({
      name: row.name,
      isDir: row.type === "d",
      mtime: row.mtime ?? 0,
      size: row.size ?? 0,
    }));
  } finally {
    db.close();
  }
}

function normalizePreviewPath(input: string): string {
  const trimmed = input.replace(/^\/+/, "").replace(/^\.\/+/, "");
  const normalized = path.posix.normalize(trimmed);
  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    throw new Error("invalid path");
  }
  return normalized;
}

function isLikelyBinary(data: Buffer): boolean {
  if (!data.length) return false;
  let suspicious = 0;
  for (const byte of data) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32) || byte === 127) {
      suspicious += 1;
    }
  }
  return suspicious / data.length > 0.3;
}

async function readTextPreview({
  filePath,
  size,
  mtime,
  maxBytes,
}: {
  filePath: string;
  size?: number;
  mtime?: number;
  maxBytes: number;
}): Promise<{
  content: string;
  truncated: boolean;
  size: number;
  mtime: number;
}> {
  const stats = size == null || mtime == null ? await stat(filePath) : null;
  if (stats && !stats.isFile()) {
    throw new Error("path is not a file");
  }
  const totalSize = size ?? stats?.size ?? 0;
  const mtimeMs = Math.floor(mtime ?? stats?.mtimeMs ?? 0);
  const readSize = Math.min(totalSize, maxBytes);
  const fd = await nodeOpen(
    filePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const buffer = Buffer.alloc(readSize);
    const { bytesRead } = await fd.read(buffer, 0, readSize, 0);
    const data = buffer.subarray(0, bytesRead);
    if (isLikelyBinary(data)) {
      throw new Error("binary file preview not supported");
    }
    return {
      content: data.toString("utf8"),
      truncated: totalSize > maxBytes,
      size: totalSize,
      mtime: mtimeMs,
    };
  } finally {
    await fd.close();
  }
}

async function getBackupIndexEntry({
  project_id,
  backup_id,
  path: entryPath,
}: {
  project_id: string;
  backup_id: string;
  path: string;
}): Promise<{ type: string; size: number; mtime: number } | null> {
  await syncBackupIndexCache(project_id);
  const manifest = await loadBackupIndexManifest(project_id);
  const entry = manifest.entries[backup_id];
  if (!entry) return null;
  const dbPath = join(backupIndexDir(project_id), entry.file);
  if (!(await exists(dbPath))) return null;
  const parent = entryPath.includes("/")
    ? path.posix.dirname(entryPath).replace(/^\.$/, "")
    : "";
  const name = path.posix.basename(entryPath);
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare(
        "SELECT type, size, mtime FROM files WHERE parent = ? AND name = ?",
      )
      .get(parent, name);
    if (!row) return null;
    const type =
      typeof row.type === "string" ? row.type : String(row.type ?? "");
    const size = Number(row.size ?? 0);
    const mtime = Number(row.mtime ?? 0);
    return {
      type,
      size: Number.isFinite(size) ? size : 0,
      mtime: Number.isFinite(mtime) ? mtime : 0,
    };
  } finally {
    db.close();
  }
}

// Rustic backups
async function createBackup({
  project_id,
  limit,
  tags,
  lro,
}: {
  project_id: string;
  limit?: number;
  tags?: string[];
  lro?: LroRef;
}): Promise<{ time: Date; id: string }> {
  const vol = await getVolume(project_id);
  vol.fs.rusticRepo = await resolveRusticRepo(project_id);
  const progress = createLroRusticReporter(lro, "backup");
  const result = await vol.rustic.backup({
    limit,
    tags,
    progress,
    index: { project_id },
  });
  if (result.index_path) {
    try {
      await recordBackupIndexLocal({
        project_id,
        backup_id: result.id,
        snapshot_id: result.index_snapshot_id,
      });
    } catch (err) {
      logger.warn("backup index manifest update failed", { project_id, err });
    }
  }
  try {
    await reportBackupSuccess(project_id, result.time);
  } catch (err) {
    logger.warn("backup success report failed", { project_id, err });
  }
  return result;
}

async function restoreBackup({
  project_id,
  id,
  path: backupPath,
  dest,
  lro,
}: {
  project_id: string;
  id: string;
  path?: string;
  dest?: string;
  lro?: LroRef;
}): Promise<void> {
  const vol = await getVolumeForBackup(project_id);
  const home = projectMountpoint(project_id);
  const stagingRoot = join(dirname(home), RESTORE_STAGING_ROOT);
  const stagingHome = join(stagingRoot, volName(project_id));
  const restorePath = backupPath ?? "";
  const destPath = dest ?? restorePath;

  const assertSubvolumeRoot = async (root: string, label: string) => {
    if (!(await exists(root))) {
      throw new Error(`${label} does not exist: ${root}`);
    }
    const isSubvolume = await isBtrfsSubvolume(root);
    if (!isSubvolume) {
      throw new Error(`${label} is not a btrfs subvolume: ${root}`);
    }
  };

  let root = home;
  let relDest = destPath ?? "";

  if (destPath && path.isAbsolute(destPath)) {
    if (isSubPath(home, destPath)) {
      root = home;
      relDest = path.relative(home, destPath);
    } else if (isSubPath(stagingHome, destPath)) {
      root = stagingHome;
      relDest = path.relative(stagingHome, destPath);
    } else {
      throw new Error(
        `restore destination must be within project home or restore staging: ${destPath}`,
      );
    }
  } else {
    const resolved = path.resolve(home, destPath || "");
    if (!isSubPath(home, resolved)) {
      throw new Error(`restore destination escapes project home: ${destPath}`);
    }
    root = home;
    relDest = path.relative(home, resolved);
  }

  await assertSubvolumeRoot(
    root,
    root === home ? "project home" : "restore staging",
  );

  const restoreFs =
    root === home
      ? vol.fs
      : new SandboxedFilesystem(root, {
          rusticRepo: vol.fs.rusticRepo,
          host: vol.name,
        });

  const progress = createLroRusticReporter(lro, "restore");
  await restoreFs.rustic(
    ["restore", `${id}${restorePath ? ":" + restorePath : ""}`, relDest],
    {
      timeout: 30 * 60 * 1000,
      env: lro ? { RUSTIC_PROGRESS_INTERVAL: "1s" } : undefined,
      onStderrLine: progress
        ? createRusticProgressHandler({ onProgress: progress })
        : undefined,
    },
  );
  void touchProjectLastEdited(project_id, "restore-backup");
}

async function beginRestoreStaging({
  project_id,
  home,
  restore,
}: {
  project_id: string;
  home?: string;
  restore?: RestoreMode;
}): Promise<RestoreStagingHandle | null> {
  const resolvedHome = home ?? projectMountpoint(project_id);
  return await beginRestoreStagingBtrfs({
    project_id,
    home: resolvedHome,
    restore,
  });
}

async function ensureRestoreStaging({
  handle,
}: {
  handle: RestoreStagingHandle;
}): Promise<void> {
  await ensureRestoreStagingBtrfs(handle);
}

async function finalizeRestoreStaging({
  handle,
}: {
  handle: RestoreStagingHandle;
}): Promise<void> {
  await finalizeRestoreStagingBtrfs(handle);
  void touchProjectLastEdited(handle.project_id, "restore-staging");
}

async function releaseRestoreStaging({
  handle,
  cleanupStaging,
}: {
  handle: RestoreStagingHandle;
  cleanupStaging?: boolean;
}): Promise<void> {
  await releaseRestoreStagingBtrfs(handle, { cleanupStaging });
}

async function cleanupRestoreStaging(opts?: { root?: string }): Promise<void> {
  const root = opts?.root ?? getMountPoint();
  await cleanupRestoreStagingBtrfs({ root });
}

async function deleteBackup({
  project_id,
  id,
}: {
  project_id: string;
  id: string;
}): Promise<void> {
  const vol = await getVolumeForBackup(project_id);
  await vol.rustic.forget({ id });
  try {
    await rustic(
      ["forget", "--filter-label", `${BACKUP_INDEX_LABEL_PREFIX}${id}`],
      {
        repo: vol.fs.rusticRepo,
        host: backupIndexHost(project_id),
        timeout: 30 * 60 * 1000,
      },
    );
  } catch (err) {
    logger.warn("backup index delete failed", { project_id, id, err });
  }
  await removeBackupIndexLocal(project_id, id).catch((err) => {
    logger.warn("backup index cache cleanup failed", { project_id, id, err });
  });
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
  const vol = await getVolumeForBackup(project_id);
  await vol.rustic.update(counts, { limit });
  try {
    const backups = await vol.rustic.snapshots();
    await syncBackupIndexCache(project_id, {
      backupIds: new Set(backups.map((backup) => backup.id)),
      force: true,
    });
  } catch (err) {
    logger.warn("backup index update failed", { project_id, err });
  }
}

export async function getBackups({
  project_id,
  indexed_only,
}: {
  project_id: string;
  indexed_only?: boolean;
}): Promise<
  {
    id: string;
    time: Date;
    summary: { [key: string]: string | number };
  }[]
> {
  if (indexed_only) {
    try {
      await syncBackupIndexCache(project_id);
      const manifest = await loadBackupIndexManifest(project_id);
      const backups: {
        id: string;
        time: Date;
        summary: { [key: string]: string | number };
      }[] = [];
      for (const entry of Object.values(manifest.entries)) {
        if (!entry?.file) continue;
        const dbPath = join(backupIndexDir(project_id), entry.file);
        if (!(await exists(dbPath))) continue;
        const db = new DatabaseSync(dbPath);
        try {
          const metaRows = db.prepare("SELECT key, value FROM meta").all();
          const meta = Object.fromEntries(
            metaRows.map((row: { key: string; value: string }) => [
              row.key,
              row.value,
            ]),
          );
          const backupId = meta.backup_id;
          const backupTime = meta.backup_time
            ? new Date(meta.backup_time)
            : null;
          if (!backupId || !backupTime) continue;
          backups.push({ id: backupId, time: backupTime, summary: {} });
        } finally {
          db.close();
        }
      }
      backups.sort((a, b) => a.time.valueOf() - b.time.valueOf());
      return backups;
    } catch (err) {
      logger.warn("backup index list failed", { project_id, err });
      return [];
    }
  }
  const vol = await getVolumeForBackup(project_id);
  return await vol.rustic.snapshots();
}

async function getBackupFiles({
  project_id,
  id,
  path,
}: {
  project_id: string;
  id: string;
  path?: string;
}): Promise<{ name: string; isDir: boolean; mtime: number; size: number }[]> {
  try {
    return await getBackupFilesIndexed({ project_id, id, path });
  } catch (err) {
    logger.warn("backup index listing failed", { project_id, id, err });
    return [];
  }
}

async function findBackupFiles({
  project_id,
  glob,
  iglob,
  path,
  ids,
}: {
  project_id: string;
  glob?: string[];
  iglob?: string[];
  path?: string;
  ids?: string[];
}): Promise<
  {
    id: string;
    time: Date;
    path: string;
    isDir: boolean;
    mtime: number;
    size: number;
  }[]
> {
  try {
    const indexed = await findBackupFilesIndexed({
      project_id,
      glob,
      iglob,
      path,
      ids,
    });
    return indexed;
  } catch (err) {
    logger.warn("backup index search failed", { project_id, err });
    return [];
  }
}

async function getBackupFileText({
  project_id,
  id,
  path: previewPath,
  max_bytes,
}: {
  project_id: string;
  id: string;
  path: string;
  max_bytes?: number;
}): Promise<{
  content: string;
  truncated: boolean;
  size: number;
  mtime: number;
}> {
  const cleanedPath = normalizePreviewPath(previewPath);
  const entry = await getBackupIndexEntry({
    project_id,
    backup_id: id,
    path: cleanedPath,
  });
  if (!entry) {
    throw new Error("backup file is not indexed on this host");
  }
  if (entry.type === "d") {
    throw new Error("path is a directory");
  }
  const maxBytes = max_bytes ?? MAX_TEXT_PREVIEW_BYTES;
  await mkdir(backupIndexDir(project_id), { recursive: true });
  const tmpDir = await mkdtemp(join(backupIndexDir(project_id), "preview-"));
  try {
    const vol = await getVolumeForBackup(project_id);
    const previewFs = new SandboxedFilesystem(backupIndexDir(project_id), {
      host: vol.name,
      rusticRepo: vol.fs.rusticRepo,
    });
    const dest = path.relative(backupIndexDir(project_id), tmpDir);
    await previewFs.rustic(["restore", `${id}:${cleanedPath}`, dest], {
      timeout: 5 * 60 * 1000,
    });
    const restoredPath = join(tmpDir, cleanedPath);
    if (!isSubPath(tmpDir, restoredPath)) {
      throw new Error("invalid restore path");
    }
    // Rustic restore of a single file writes it directly into the destination
    // directory (basename only), not the original path hierarchy.
    const previewPath = join(tmpDir, path.posix.basename(cleanedPath));
    if (!(await exists(previewPath))) {
      throw new Error("restored file not found");
    }
    return await readTextPreview({
      filePath: previewPath,
      size: entry.size,
      mtime: entry.mtime,
      maxBytes,
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function getSnapshotFileText({
  project_id,
  snapshot,
  path: previewPath,
  max_bytes,
}: {
  project_id: string;
  snapshot: string;
  path: string;
  max_bytes?: number;
}): Promise<{
  content: string;
  truncated: boolean;
  size: number;
  mtime: number;
}> {
  // Snapshot previews are read directly from the filesystem path; keeping this
  // API ensures consistent size limits and binary detection.
  const cleanedPath = normalizePreviewPath(previewPath);
  const vol = await getVolume(project_id);
  const snapshotPath = vol.snapshots.path(snapshot, cleanedPath);
  const absPath = await vol.fs.safeAbsPath(snapshotPath);
  const maxBytes = max_bytes ?? MAX_TEXT_PREVIEW_BYTES;
  return await readTextPreview({ filePath: absPath, maxBytes });
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
  logger.debug("initFsServer");
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
    onMutation: ({ subject, op }) => {
      const project_id = projectIdFromSubject(subject);
      void touchProjectLastEdited(project_id, `fs:${op}`);
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
  logger.debug("initFileServer", { enableSsh });
  if (servers != null) {
    logger.debug("initFileServer: already initialized");

    return servers;
  }

  if (fs == null) {
    if (fileServerMountpoint) {
      const resolvedRusticRepo = await resolveRusticRepo();
      logger.debug("initFileServer: initializing fs mountpoint", {
        fileServerMountpoint,
        resolvedRusticRepo,
      });
      fs = await filesystem({
        mount: fileServerMountpoint,
        rustic: resolvedRusticRepo,
      });
    } else {
      const imageDir = join(data, "btrfs", "image");
      const mountPoint = join(data, "btrfs", "mnt");
      const resolvedRusticRepo = await resolveRusticRepo();
      logger.debug("initFileServer: initializing fs mountpoint", {
        mountPoint,
        resolvedRusticRepo,
      });
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
        rustic: resolvedRusticRepo,
      });
    }
  }

  logger.debug("initFileServer: create conat server");

  try {
    await cleanupRestoreStaging();
  } catch (err) {
    logger.warn("restore staging cleanup failed", { err: `${err}` });
  }

  const file = await createFileServer({
    client,
    mount: reuseInFlight(mount),
    ensureVolume: reuseInFlight(async ({ project_id }) => {
      await ensureVolume(project_id);
    }),
    clone,
    getUsage: reuseInFlight(getUsage),
    getQuota: reuseInFlight(getQuota),
    setQuota,
    cp,
    // backups
    createBackup: reuseInFlight(createBackup),
    restoreBackup: reuseInFlight(restoreBackup),
    beginRestoreStaging,
    ensureRestoreStaging,
    finalizeRestoreStaging,
    releaseRestoreStaging,
    cleanupRestoreStaging,
    deleteBackup: reuseInFlight(deleteBackup),
    updateBackups: reuseInFlight(updateBackups),
    getBackups: reuseInFlight(getBackups),
    getBackupFiles: reuseInFlight(getBackupFiles),
    findBackupFiles: reuseInFlight(findBackupFiles),
    getBackupFileText: reuseInFlight(getBackupFileText),
    // snapshots
    createSnapshot,
    deleteSnapshot,
    updateSnapshots,
    allSnapshotUsage,
    getSnapshotFileText: reuseInFlight(getSnapshotFileText),
    // file sync
    createSync,
    getAllSyncs,
    getSync,
    syncCommand,
  });
  logger.debug("initFileServer: fs successfully initialized");

  // Expose fast in-host file I/O for ACP/container executor when running inside
  // project-host. Paths are expected to be relative to /root inside the
  // project container.
  setContainerFileIO({
    mountPoint: projectMountpoint,
    readFile: async (project_id: string, p: string) => {
      const { hostPath, base } = projectHostPath(project_id, p);
      const fd = await nodeOpen(
        hostPath,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      );
      try {
        // TOCTOU mitigation: re-resolve via /proc/self/fd/<fd> AFTER open with
        // O_NOFOLLOW. If a user flips the path to a symlink between path
        // resolution and open, O_NOFOLLOW blocks the follow; if they flip it
        // after open, realpath on the FD confirms we're still under the
        // project root. This protects against symlink races into host paths.
        const real = await nodeRealpath(`/proc/self/fd/${fd.fd}`);
        if (!real.startsWith(base)) {
          throw Error(`resolved path escapes project root: ${real}`);
        }
        return await nodeReadFile(fd, "utf8");
      } finally {
        await fd.close();
      }
    },
    writeFile: async (project_id: string, p: string, content: string) => {
      const { hostPath, base } = projectHostPath(project_id, p);
      const fd = await nodeOpen(
        hostPath,
        fsConstants.O_CREAT |
          fsConstants.O_TRUNC |
          fsConstants.O_WRONLY |
          fsConstants.O_NOFOLLOW,
        0o600,
      );
      try {
        // Same TOCTOU guard as read: confirm the opened FD still resolves
        // inside the project root before writing.
        const real = await nodeRealpath(`/proc/self/fd/${fd.fd}`);
        if (!real.startsWith(base)) {
          throw Error(`resolved path escapes project root: ${real}`);
        }
        await nodeWriteFile(fd, content, "utf8");
      } finally {
        await fd.close();
      }
    },
  });

  let ssh: any = { close: () => {}, projectProxyHandlers: [] };
  if (enableSsh) {
    logger.debug("initFileServer: configure ssh proxy");

    logger.debug("initFileServer: get host id...");
    const hostId = requireHostId();
    logger.debug("initFileServer: hostId", hostId);
    // sshpiperd must use the stable per-host keypair persisted in sqlite.
    const sshpiperdKey = ensureSshpiperdKey(hostId);
    logger.debug("initFileServer: got key");
    const hostKeyPath = join(secrets, "sshpiperd", "host_key");
    logger.debug("initFileServer: create", dirname(hostKeyPath));
    await mkdir(dirname(hostKeyPath), { recursive: true });
    logger.debug("initFileServer: create", hostKeyPath);
    await writeFile(hostKeyPath, sshpiperdKey.privateKey, { mode: 0o600 });
    await chmod(hostKeyPath, 0o600);
    logger.debug("initFileServer: ssh configured");
    const getSshdPort = (target: SshTarget): number | null => {
      const row = getProject(target.project_id);
      return row?.ssh_port ?? null;
    };

    const getAuthorizedKeys = async (target: SshTarget): Promise<string> => {
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

    logger.debug("initFileServer: start ssh server");

    ssh = await initSshServer({
      proxyHandlers: true,
      getSshdPort,
      getAuthorizedKeys,
      hostKeyPath,
    });
  }

  logger.debug("initFileServer: success");

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
  let vol;
  try {
    vol = await getVolume(project_id);
  } catch (err) {
    logger.debug("writeManagedAuthorizedKeys: missing volume", {
      project_id,
      err: `${err}`,
    });
    return;
  }
  const managedPath = join(vol.path, INTERNAL_SSH_CONFIG, "authorized_keys");
  await mkdir(join(vol.path, INTERNAL_SSH_CONFIG), {
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
