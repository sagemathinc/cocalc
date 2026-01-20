/*
File server - manages where projects are stored.

This is a conat service that runs directly on the btrfs file server.
Only admin processes (hubs) can talk directly to it, not normal users.
It handles:

Core Functionality:

  - creating volume where a project's files are stored
     - from scratch, and as a zero-cost clone of an existing project
  - copy files between distinct volumes (with btrfs this is done via
    highly efficient dedup'd cloning).

Additional functionality:
  - set a quota on project volume
  - delete volume
  - create snapshot
  - update snapshots
  - create backup

The subject is file-server.{project_id} and there are many file-servers, one
for each project-host.

Note: file writes are handled by the conat fs service. `writeFileDelta` is
preferred by sync-doc because it can apply patches and perform atomic
write+rename on the backend; plain `writeFile` may still be a truncate+write
path, which can corrupt large chat logs if interrupted mid-write.
*/

import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";
import { type SnapshotCounts } from "@cocalc/util/consts/snapshots";
import { type CopyOptions } from "./fs";
export { type CopyOptions };
import { type MutagenSyncSession } from "@cocalc/conat/project/mutagen/types";
import { type LroScopeType } from "@cocalc/conat/hub/api/lro";

const SUBJECT = "file-server";

export interface Sync {
  // {volume-name}:path/into/volume
  src: string;
  dest: string;

  // if true, dest is kept as an exact copy of src
  // and any changes to dest are immediately reverted;
  // basically, dest acts as a read-only copy of src.
  replica?: boolean;
}

export type RestoreMode = "none" | "auto" | "required";

export interface RestoreStagingHandle {
  project_id: string;
  home: string;
  restore: RestoreMode;
  homeExists: boolean;
  stagingRoot: string;
  stagingPath: string;
  markerPath: string;
}

export interface LroRef {
  op_id: string;
  scope_type: LroScopeType;
  scope_id: string;
}

export interface FileTextPreview {
  content: string;
  truncated: boolean;
  size: number;
  mtime: number;
}

export interface Fileserver {
  mount: (opts: { project_id: string }) => Promise<{ path: string }>;
  // ensure a project volume exists (idempotent)
  ensureVolume: (opts: { project_id: string }) => Promise<void>;

  // create project_id as an exact lightweight clone of src_project_id
  clone: (opts: {
    project_id: string;
    src_project_id: string;
  }) => Promise<void>;

  getUsage: (opts: { project_id: string }) => Promise<{
    size: number;
    used: number;
    free: number;
  }>;

  getQuota: (opts: { project_id: string }) => Promise<{
    size: number;
    used: number;
  }>;

  setQuota: (opts: {
    project_id: string;
    size: number | string;
  }) => Promise<void>;

  cp: (opts: {
    src: { project_id: string; path: string | string[] };
    dest: { project_id: string; path: string };
    options?: CopyOptions;
  }) => Promise<void>;

  /////////////
  // Sync
  // Automated realtime bidirectional sync of files between a path
  // in one project with a path in another project.
  // It's bidirectional, but conflicts always resolve in favor
  // of the source.
  /////////////
  createSync: (sync: Sync & { ignores?: string[] }) => Promise<void>;
  // list all sync links with src or dest the given volume
  getAllSyncs: (opts: {
    name: string;
  }) => Promise<(MutagenSyncSession & Sync)[]>;
  getSync: (sync: Sync) => Promise<undefined | (MutagenSyncSession & Sync)>;
  syncCommand: (
    command: "flush" | "reset" | "pause" | "resume" | "terminate",
    sync: Sync,
  ) => Promise<{ stdout: string; stderr: string; exit_code: number }>;

  /////////////
  // BACKUPS
  /////////////

  // create new complete backup of the project; this first snapshots the
  // project, makes a backup of the snapshot, then deletes the snapshot, so the
  // backup is guranteed to be consistent.
  createBackup: (opts: {
    project_id: string;
    limit?: number;
    tags?: string[];
    lro?: LroRef;
  }) => Promise<{ time: Date; id: string }>;
  // restore the given path in the backup to the given dest.  The default
  // path is '' (the whole project) and the default destination is the
  // same as the path.
  restoreBackup: (opts: {
    project_id: string;
    id: string;
    path?: string;
    dest?: string;
    lro?: LroRef;
  }) => Promise<void>;
  // staged restore helpers (filesystem-specific implementation)
  beginRestoreStaging: (opts: {
    project_id: string;
    home?: string;
    restore?: RestoreMode;
  }) => Promise<RestoreStagingHandle | null>;
  ensureRestoreStaging: (opts: {
    handle: RestoreStagingHandle;
  }) => Promise<void>;
  finalizeRestoreStaging: (opts: {
    handle: RestoreStagingHandle;
  }) => Promise<void>;
  releaseRestoreStaging: (opts: {
    handle: RestoreStagingHandle;
    cleanupStaging?: boolean;
  }) => Promise<void>;
  cleanupRestoreStaging: (opts?: { root?: string }) => Promise<void>;
  // delete the given backup
  deleteBackup: (opts: { project_id: string; id: string }) => Promise<void>;
  // Return list of id's and timestamps of all backups of this project.
  updateBackups: (opts: {
    project_id: string;
    counts?: Partial<SnapshotCounts>;
    // global limit, same as with createBackup above; can prevent new backups from being
    // made if counts are too large!
    limit?: number;
  }) => Promise<void>;
  getBackups: (opts: { project_id: string; indexed_only?: boolean }) => Promise<
    {
      id: string;
      time: Date;
      summary: { [key: string]: string | number };
    }[]
  >;

  // Return list of files in the given backup for the given directory path
  // (non-recursive). Entries include basic metadata.
  getBackupFiles: (opts: {
    project_id: string;
    id: string;
    path?: string;
  }) => Promise<
    { name: string; isDir: boolean; mtime: number; size: number }[]
  >;
  findBackupFiles: (opts: {
    project_id: string;
    glob?: string[];
    iglob?: string[];
    path?: string;
    ids?: string[];
  }) => Promise<
    {
      id: string;
      time: Date;
      path: string;
      isDir: boolean;
      mtime: number;
      size: number;
    }[]
  >;
  getBackupFileText: (opts: {
    project_id: string;
    id: string;
    path: string;
    max_bytes?: number;
  }) => Promise<FileTextPreview>;

  /////////////
  // SNAPSHOTS
  /////////////
  createSnapshot: (opts: {
    project_id: string;
    name?: string;
    // if given, throw error if there are already limit snapshots, i.e., this is a hard limit on
    // the total number of snapshots (to avoid abuse/bugs).
    limit?: number;
    // defaults to true
    readOnly?: boolean;
  }) => Promise<void>;
  deleteSnapshot: (opts: { project_id: string; name: string }) => Promise<void>;
  updateSnapshots: (opts: {
    project_id: string;
    counts?: Partial<SnapshotCounts>;
    // global limit, same as with createSnapshot above; can prevent new snapshots from being
    // made if counts are too large!
    limit?: number;
  }) => Promise<void>;
  allSnapshotUsage: (opts: { project_id: string }) => Promise<SnapshotUsage[]>;
  getSnapshotFileText: (opts: {
    project_id: string;
    snapshot: string;
    path: string;
    max_bytes?: number;
  }) => Promise<FileTextPreview>;
}

export interface SnapshotUsage {
  // name of this snapshot
  name: string;
  // amount of space used by this snapshot in bytes
  used: number;
  // amount of space that would be freed by deleting this snapshot
  exclusive: number;
  // total quota in bytes across all snapshot
  quota: number;
}

export interface Options extends Fileserver {
  client?: Client;
}

export async function server({ client, ...impl }: Options) {
  client ??= conat();

  const sub = await client.service<Fileserver>(`${SUBJECT}.*`, impl);

  return {
    close: () => {
      sub.close();
    },
  };
}

export function client({
  client,
  project_id,
  timeout,
}: {
  client?: Client;
  // provide project_id so that client is automatically selected to
  // be the one for the project-host that contains the project.
  project_id?: string;
  timeout?: number;
} = {}): Fileserver {
  client ??= conat();
  // we use this subject so that requests get routed to the
  // project-host with the given project_id via
  // src/packages/server/conat/route-client.ts
  return client.call<Fileserver>(
    `${SUBJECT}.${project_id ? project_id : "api"}`,
    timeout ? { timeout } : undefined,
  );
}
