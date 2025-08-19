/*
File server - managers where projects are stored.

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

*/

import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";
import { type SnapshotCounts } from "@cocalc/util/db-schema/projects";
import { type CopyOptions } from "./fs";
export { type CopyOptions };

const SUBJECT = "file-server";

export interface Fileserver {
  mount: (opts: { project_id: string }) => Promise<{ path: string }>;

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
  // BACKUPS
  /////////////

  // create new complete backup of the project; this first snapshots the
  // project, makes a backup of the snapshot, then deletes the snapshot, so the
  // backup is guranteed to be consistent.
  createBackup: (opts: {
    project_id: string;
    limit?: number;
  }) => Promise<{ time: Date; id: string }>;
  // restore the given path in the backup to the given dest.  The default
  // path is '' (the whole project) and the default destination is the
  // same as the path.
  restoreBackup: (opts: {
    project_id: string;
    id: string;
    path?: string;
    dest?: string;
  }) => Promise<void>;
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
  getBackups: (opts: { project_id: string }) => Promise<
    {
      id: string;
      time: Date;
    }[]
  >;

  // Return list of all files in the given backup.
  // TODO: would be nice to filter path, since there could be millions of files (?).
  getBackupFiles: (opts: {
    project_id: string;
    id: string;
  }) => Promise<string[]>;

  /////////////
  // SNAPSHOTS
  /////////////
  createSnapshot: (opts: {
    project_id: string;
    name?: string;
    // if given, throw error if there are already limit snapshots, i.e., this is a hard limit on
    // the total number of snapshots (to avoid abuse/bugs).
    limit?: number;
  }) => Promise<void>;
  deleteSnapshot: (opts: { project_id: string; name: string }) => Promise<void>;
  updateSnapshots: (opts: {
    project_id: string;
    counts?: Partial<SnapshotCounts>;
    // global limit, same as with createSnapshot above; can prevent new snapshots from being
    // made if counts are too large!
    limit?: number;
  }) => Promise<void>;
}

export interface Options extends Fileserver {
  client?: Client;
}

export async function server({ client, ...impl }: Options) {
  client ??= conat();

  const sub = await client.service<Fileserver>(SUBJECT, impl);

  return {
    close: () => {
      sub.close();
    },
  };
}

export function client({ client }: { client?: Client } = {}): Fileserver {
  client ??= conat();
  return client.call<Fileserver>(SUBJECT);
}
