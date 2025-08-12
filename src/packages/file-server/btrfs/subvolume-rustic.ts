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

export const RUSTIC = "rustic";

const RUSTIC_SNAPSHOT = "temp-rustic-snapshot";

const logger = getLogger("file-server:btrfs:subvolume-rustic");

interface Snapshot {
  id: string;
  time: Date;
}

export class SubvolumeRustic {
  constructor(private subvolume: Subvolume) {}

  // create a new rustic backup
  backup = async ({
    timeout = 30 * 60 * 1000,
  }: { timeout?: number } = {}): Promise<Snapshot> => {
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
      logger.debug(`backup: backing up ${RUSTIC_SNAPSHOT} using rustic`);
      const { stdout } = parseOutput(
        await this.subvolume.fs.rustic(["backup", "-x", "--json", "."], {
          timeout,
          cwd: target,
        }),
      );
      const { time, id } = JSON.parse(stdout);
      return { time: new Date(time), id };
    } finally {
      logger.debug(`backup: deleting temporary ${RUSTIC_SNAPSHOT}`);
      await this.subvolume.snapshots.delete(RUSTIC_SNAPSHOT);
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
    dest ??= path;
    const { stdout } = parseOutput(
      await this.subvolume.fs.rustic(
        ["restore", `${id}${path != null ? ":" + path : ""}`, dest],
        { timeout },
      ),
    );
    return stdout;
  };

  // returns list of snapshots sorted from oldest to newest
  snapshots = async (): Promise<Snapshot[]> => {
    const { stdout } = parseOutput(
      await this.subvolume.fs.rustic(["snapshots", "--json"]),
    );
    const x = JSON.parse(stdout);
    const v = x[0][1].map(({ time, id }) => {
      return { time: new Date(time), id };
    });
    v.sort(field_cmp("time"));
    return v;
  };

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
    return stdout;
  };
}
