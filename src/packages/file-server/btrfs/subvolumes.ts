import { type Filesystem } from "./filesystem";
import { subvolume, type Subvolume } from "./subvolume";
import getLogger from "@cocalc/backend/logger";
import { SNAPSHOTS } from "./subvolume-snapshots";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { join } from "path";
import { btrfs } from "./util";
import { chmod, rename, rm } from "node:fs/promises";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import { RUSTIC } from "./subvolume-rustic";

const RESERVED = new Set([RUSTIC, SNAPSHOTS]);

const logger = getLogger("file-server:btrfs:subvolumes");

export class Subvolumes {
  public readonly fs: SandboxedFilesystem;

  constructor(public filesystem: Filesystem) {
    this.fs = new SandboxedFilesystem(this.filesystem.opts.mount);
  }

  get = async (name: string): Promise<Subvolume> => {
    if (RESERVED.has(name)) {
      throw Error(`${name} is reserved`);
    }
    return await subvolume({ filesystem: this.filesystem, name });
  };

  clone = async (source: string, dest: string) => {
    logger.debug("clone ", { source, dest });
    if (RESERVED.has(dest)) {
      throw Error(`${dest} is reserved`);
    }
    if (!(await exists(join(this.filesystem.opts.mount, source)))) {
      throw Error(`subvolume ${source} does not exist`);
    }
    if (await exists(join(this.filesystem.opts.mount, dest))) {
      throw Error(`subvolume ${dest} already exists`);
    }
    await btrfs({
      args: [
        "subvolume",
        "snapshot",
        join(this.filesystem.opts.mount, source),
        join(this.filesystem.opts.mount, source, dest),
      ],
    });
    await rename(
      join(this.filesystem.opts.mount, source, dest),
      join(this.filesystem.opts.mount, dest),
    );
    const snapdir = join(this.filesystem.opts.mount, dest, SNAPSHOTS);
    if (await exists(snapdir)) {
      await chmod(snapdir, "0700");
      await rm(snapdir, {
        recursive: true,
        force: true,
      });
    }
    const src = await this.get(source);
    const dst = await this.get(dest);
    const { size } = await src.quota.get();
    if (size) {
      await dst.quota.set(size);
    }
    return dst;
  };

  delete = async (name: string) => {
    await btrfs({
      args: ["subvolume", "delete", join(this.filesystem.opts.mount, name)],
    });
  };

  list = async (): Promise<string[]> => {
    const { stdout } = await btrfs({
      args: ["subvolume", "list", this.filesystem.opts.mount],
    });
    return stdout
      .split("\n")
      .map((x) => x.split(" ").slice(-1)[0])
      .filter((x) => x)
      .sort();
  };
}
