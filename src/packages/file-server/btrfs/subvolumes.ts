import { type Filesystem } from "./filesystem";
import { subvolume, type Subvolume } from "./subvolume";
import getLogger from "@cocalc/backend/logger";
import { SNAPSHOTS } from "./subvolume-snapshots";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { join, normalize } from "path";
import { btrfs, isDir } from "./util";
import { chmod, rename, rm } from "node:fs/promises";
import { executeCode } from "@cocalc/backend/execute-code";

const RESERVED = new Set(["bup", SNAPSHOTS]);

const logger = getLogger("file-server:btrfs:subvolumes");

export class Subvolumes {
  constructor(public filesystem: Filesystem) {}

  get = async (name: string): Promise<Subvolume> => {
    if (RESERVED.has(name)) {
      throw Error(`${name} is reserved`);
    }
    return await subvolume({ filesystem: this.filesystem, name });
  };

  // create a subvolume by cloning an existing one.
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

  rsync = async ({
    src,
    target,
    args = ["-axH"],
    timeout = 5 * 60 * 1000,
  }: {
    src: string;
    target: string;
    args?: string[];
    timeout?: number;
  }): Promise<{ stdout: string; stderr: string; exit_code: number }> => {
    let srcPath = normalize(join(this.filesystem.opts.mount, src));
    if (!srcPath.startsWith(this.filesystem.opts.mount)) {
      throw Error("suspicious source");
    }
    let targetPath = normalize(join(this.filesystem.opts.mount, target));
    if (!targetPath.startsWith(this.filesystem.opts.mount)) {
      throw Error("suspicious target");
    }
    if (!srcPath.endsWith("/") && (await isDir(srcPath))) {
      srcPath += "/";
      if (!targetPath.endsWith("/")) {
        targetPath += "/";
      }
    }
    return await executeCode({
      command: "rsync",
      args: [...args, srcPath, targetPath],
      err_on_exit: false,
      timeout: timeout / 1000,
    });
  };
}
