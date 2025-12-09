/*
Rustic Architecture:

The minimal option is a single global repo stored in the btrfs filesystem.
Obviously, admins should rsync this regularly to a separate location as a
genuine backup strategy.  It's better to configure repo on separate
storage.  Rustic has a very wide range of options.

Instead of using btrfs send/recv for backups, we use Rustic because:
 - much easier to check backups are valid
 - globally compressed and dedup'd!  btrfs send/recv is NOT globally dedupd
 - decoupled from any btrfs issues
 - rustic has full support for using cloud buckets as hot/cold storage
 - not tied to any specific filesystem at all
 - easier to offsite via incremental rsync
 - much more space efficient with *global* dedup and compression
 - rustic "is" restic, which is very mature and proven
 - rustic is VERY fast, being parallel and in rust.
*/

import { type Subvolume } from "./subvolume";
import getLogger from "@cocalc/backend/logger";
import { parseOutput } from "@cocalc/backend/sandbox/exec";
import { field_cmp } from "@cocalc/util/misc";
import { type SnapshotCounts, updateRollingSnapshots } from "./snapshots";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { ConatError } from "@cocalc/conat/core/client";
import { DEFAULT_BACKUP_COUNTS } from "@cocalc/util/consts/snapshots";
import { syncFiles } from "@cocalc/backend/data";
import { isValidUUID } from "@cocalc/util/misc";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { sudo } from "./util";

export const RUSTIC = "rustic";

const RUSTIC_SNAPSHOT = "temp-rustic-snapshot";
const PERSIST_STAGING = ".cocalc-persist";

const logger = getLogger("file-server:btrfs:subvolume-rustic");

interface Snapshot {
  id: string;
  time: Date;
  summary: { [key: string]: string | number };
}

export class SubvolumeRustic {
  constructor(public readonly subvolume: Subvolume) {}

  private projectId(): string | undefined {
    const prefix = "project-";
    if (!this.subvolume.name.startsWith(prefix)) return undefined;
    const id = this.subvolume.name.slice(prefix.length);
    return isValidUUID(id) ? id : undefined;
  }

  private persistPath(): string | undefined {
    const id = this.projectId();
    if (!id) return undefined;
    return join(syncFiles.local, "projects", id);
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  // Stage the per-project persist store inside the project tree so it gets included
  // in the temporary backup snapshot. Returns true if staging occurred.
  private async stagePersist(): Promise<boolean> {
    const persist = this.persistPath();
    if (!persist || !(await this.pathExists(persist))) return false;
    const staging = join(this.subvolume.path, PERSIST_STAGING);
    await sudo({ command: "rm", args: ["-rf", staging] }).catch(() => {});
    await sudo({ command: "mkdir", args: ["-p", staging] });
    await sudo({
      command: "rsync",
      args: ["-a", `${persist}/`, `${staging}/`],
    });
    return true;
  }

  private async cleanupPersistStaging() {
    const staging = join(this.subvolume.path, PERSIST_STAGING);
    await sudo({ command: "rm", args: ["-rf", staging] }).catch(() => {});
  }

  private async restorePersistFromStaging() {
    const persist = this.persistPath();
    if (!persist) return;
    const staging = join(this.subvolume.path, PERSIST_STAGING);
    if (!(await this.pathExists(staging))) return;
    await sudo({ command: "rm", args: ["-rf", persist] }).catch(() => {});
    await sudo({ command: "mkdir", args: ["-p", persist] });
    await sudo({
      command: "rsync",
      args: ["-a", `${staging}/`, `${persist}/`],
    });
    await sudo({ command: "rm", args: ["-rf", staging] }).catch(() => {});
  }

  // create a new rustic backup
  backup = async ({
    limit,
    timeout = 30 * 60 * 1000,
  }: { timeout?: number; limit?: number } = {}): Promise<Snapshot> => {
    if (limit != null && (await this.snapshots()).length >= limit) {
      // 507 = "insufficient storage" for http
      throw new ConatError(`there is a limit of ${limit} backups`, {
        code: 507,
      });
    }
    if (await this.subvolume.snapshots.exists(RUSTIC_SNAPSHOT)) {
      logger.debug(`backup: deleting existing ${RUSTIC_SNAPSHOT}`);
      await this.subvolume.snapshots.delete(RUSTIC_SNAPSHOT);
    }
    const target = this.subvolume.snapshots.path(RUSTIC_SNAPSHOT);
    let stagedPersist = false;
    try {
      stagedPersist = await this.stagePersist();
      logger.debug(
        `backup: creating ${RUSTIC_SNAPSHOT} to get a consistent backup`,
      );
      await this.subvolume.snapshots.create(RUSTIC_SNAPSHOT);
      logger.debug(`backup: backing up ${RUSTIC_SNAPSHOT} using rustic`);
      const { stdout } = parseOutput(
        await this.subvolume.fs.rustic(["backup", "-x", "--json", "."], {
          timeout,
          cwd: target,
        }),
      );
      const { time, id, summary } = JSON.parse(stdout);
      return { time: new Date(time), id, summary };
    } finally {
      this.snapshotsCache = null;
      if (stagedPersist) {
        await this.cleanupPersistStaging();
      }
      logger.debug(`backup: deleting temporary ${RUSTIC_SNAPSHOT}`);
      try {
        await this.subvolume.snapshots.delete(RUSTIC_SNAPSHOT);
      } catch {}
    }
  };

  restore = async ({
    id,
    path = "",
    dest,
    timeout = 30 * 60 * 1000,
  }: {
    id: string;
    path?: string;
    dest?: string;
    timeout?: number;
  }) => {
    logger.debug("restore", { id, path, dest });
    dest ??= path;
    const { stdout } = parseOutput(
      await this.subvolume.fs.rustic(
        ["restore", `${id}${path != null ? ":" + path : ""}`, dest],
        { timeout },
      ),
    );
    // If this was a full restore (default dest) this will restore the persist
    // state too.
    if (!path && !dest) {
      await this.restorePersistFromStaging();
    }
    return stdout;
  };

  // returns list of backups, sorted from oldest to newest
  private snapshotsCache: Snapshot[] | null = null;
  snapshots = reuseInFlight(async (): Promise<Snapshot[]> => {
    if (this.snapshotsCache) {
      // potentially very expensive to get list -- we clear this on delete or create
      return this.snapshotsCache;
    }
    const { stdout } = parseOutput(
      await this.subvolume.fs.rustic(["snapshots", "--json"]),
    );
    const snapshots = JSON.parse(stdout)?.[0]?.snapshots;
    /* stdout = [
  {
    "group_key": {
      "hostname": "project-f9296958-84f2-4965-947b-78cd4a92f49a",
      "label": "",
      "paths": [
        "."
      ]
    },
    "snapshots": [
      {
        "time": "2025-12-08T16:19:25.736493671-08:00",
        "program_version": "rustic v0.10.2-1-g189b17c",
        "tree": "ab76d793af77aad8459244a3ebc9673a45ad7eb00d247aaf572c7e95d0fb8582",
        "paths": [
          "."
        ],
        "hostname": "project-f9296958-84f2-4965-947b-78cd4a92f49a",
        "username": "",
        "uid": 0,
        "gid": 0,
        "tags": [],
        "original": "94623bd2d76a2512763325330fc27a00ac9f79f2d5bb883c3efa99ec0e99f42e",
        "summary": {
          "files_new": 10,
          "files_changed": 0,
          "files_unmodified": 0,
          "total_files_processed": 10,
          "total_bytes_processed": 2622,
          "dirs_new": 27,
          "dirs_changed": 0,
          "dirs_unmodified": 0,
          "total_dirs_processed": 27,
          "total_dirsize_processed": 13908,
          "data_blobs": 6,
          "tree_blobs": 23,
          "data_added": 16478,
          "data_added_packed": 8435,
          "data_added_files": 2622,
          "data_added_files_packed": 1598,
          "data_added_trees": 13856,
          "data_added_trees_packed": 6837,
          "command": "/home/wstein/build/cocalc-lite/src/packages/backend/node_modules/.bin/rustic --password  -r /home/wstein/build/cocalc-lite/src/packages/project-host/data-0/rustic backup -x --json --no-scan --host project-f9296958-84f2-4965-947b-78cd4a92f49a -- .",
          "backup_start": "2025-12-08T16:19:25.738333528-08:00",
          "backup_end": "2025-12-08T16:19:25.767040553-08:00",
          "backup_duration": 0.028707025,
          "total_duration": 0.030546882
        },
        "id": "94623bd2d76a2512763325330fc27a00ac9f79f2d5bb883c3efa99ec0e99f42e"
      }
    ]
  }
]
*/
    const v = !snapshots
      ? []
      : snapshots.map(({ time, id, summary }) => {
          return { time: new Date(time), id, summary };
        });
    v.sort(field_cmp("time"));
    this.snapshotsCache = v;
    return v;
  });

  // return list of paths of files in this backup, as paths relative
  // to HOME, and sorted in alphabetical order.
  ls = async ({ id }: { id: string }) => {
    const { stdout } = parseOutput(
      await this.subvolume.fs.rustic(["ls", "--json", id]),
    );
    return JSON.parse(stdout).sort();
  };

  // Delete this backup.  It's genuinely not accessible anymore, though
  // this doesn't actually clean up disk space -- purge must be done separately
  // later.  Rustic likes the purge to happen maybe a day later, so it
  // can better support concurrent writes.
  forget = async ({ id }: { id: string }) => {
    const { stdout } = parseOutput(
      await this.subvolume.fs.rustic(["forget", id]),
    );
    this.snapshotsCache = null;
    return stdout;
  };

  update = async (counts?: Partial<SnapshotCounts>, opts?) => {
    return await updateRollingSnapshots({
      snapshots: this,
      counts: { ...DEFAULT_BACKUP_COUNTS, ...counts },
      opts,
    });
  };

  // Snapshot compat api, which is useful for rolling backups.

  create = async (_name?: string, { limit }: { limit?: number } = {}) => {
    await this.backup({ limit });
  };

  readdir = async (): Promise<string[]> => {
    return (await this.snapshots()).map(({ time }) => time.toISOString());
  };

  // TODO -- for now just always assume we do...
  hasUnsavedChanges = async () => {
    return true;
  };

  delete = async (name) => {
    const v = await this.snapshots();
    for (const { id, time } of v) {
      if (time.toISOString() == name) {
        await this.forget({ id });
        return;
      }
    }
    throw Error(`backup ${name} not found`);
  };
}
