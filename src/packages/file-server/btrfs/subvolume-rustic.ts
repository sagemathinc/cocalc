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
import rustic from "@cocalc/backend/sandbox/rustic";
import { field_cmp } from "@cocalc/util/misc";
import { type SnapshotCounts, updateRollingSnapshots } from "./snapshots";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { ConatError } from "@cocalc/conat/core/client";
import { DEFAULT_BACKUP_COUNTS } from "@cocalc/util/consts/snapshots";

export const RUSTIC = "rustic";

const RUSTIC_SNAPSHOT = "temp-rustic-snapshot";
const logger = getLogger("file-server:btrfs:subvolume-rustic");

interface Snapshot {
  id: string;
  time: Date;
  summary: { [key: string]: string | number };
}

export class SubvolumeRustic {
  constructor(public readonly subvolume: Subvolume) {}

  private rusticHost = async (
    args: string[],
    opts?: { timeout?: number; maxSize?: number },
  ) => {
    return await rustic(args, {
      repo: this.subvolume.fs.rusticRepo,
      host: this.subvolume.name,
      timeout: opts?.timeout,
      maxSize: opts?.maxSize,
    });
  };

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
    try {
      logger.debug(
        `backup: creating ${RUSTIC_SNAPSHOT} to get a consistent backup`,
      );
      await this.subvolume.snapshots.create(RUSTIC_SNAPSHOT);
      // Backup the snapshot path directly (no bind mounts). The project tree
      // already includes persistent metadata under ~/.local/share/cocalc/persist.
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
      await this.rusticHost(["snapshots", "--json"]),
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

  // Return directory listing (non-recursive) for the given path in a backup.
  // Uses `rustic ls -l snapshot[:path]` and parses the human output to extract
  // name/isDir/mtime/size. rustic --json does not support -l, so we parse text.
  ls = async ({
    id,
    path = "",
  }: {
    id: string;
    path?: string;
  }): Promise<
    { name: string; isDir: boolean; mtime: number; size: number }[]
  > => {
    const target = `${id}:${path}`;
    const { stdout } = parseOutput(
      await this.rusticHost(["ls", "-l", target]),
    );
    const entries: {
      name: string;
      isDir: boolean;
      mtime: number;
      size: number;
    }[] = [];
    const lines = stdout.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const firstQuote = trimmed.indexOf('"');
      const lastQuote = trimmed.lastIndexOf('"');
      if (firstQuote === -1 || lastQuote === -1 || lastQuote <= firstQuote)
        continue;
      const name = trimmed.slice(firstQuote + 1, lastQuote);
      const fields = trimmed.slice(0, firstQuote).trim().split(/\s+/);
      if (fields.length < 8) continue;
      const perms = fields[0];
      const isDir = perms.startsWith("d");
      const size = Number(fields[3]) || 0;
      const dateStr = `${fields[4]} ${fields[5]} ${fields[6]} ${fields[7]}`;
      const mtime = Date.parse(dateStr);
      entries.push({ name, isDir, mtime: isNaN(mtime) ? 0 : mtime, size });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  };

  // Delete this backup.  It's genuinely not accessible anymore, though
  // this doesn't actually clean up disk space -- purge must be done separately
  // later.  Rustic likes the purge to happen maybe a day later, so it
  // can better support concurrent writes.
  forget = async ({ id }: { id: string }) => {
    const { stdout } = parseOutput(
      await this.rusticHost(["forget", id]),
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
