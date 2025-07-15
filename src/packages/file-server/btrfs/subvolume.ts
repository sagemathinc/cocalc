/*
A subvolume
*/

import { type Filesystem, DEFAULT_SUBVOLUME_SIZE } from "./filesystem";
import refCache from "@cocalc/util/refcache";
import { sudo } from "./util";
import { join, normalize } from "path";
import { SubvolumeFilesystem } from "./subvolume-fs";
import { SubvolumeBup } from "./subvolume-bup";
import { SubvolumeSnapshots } from "./subvolume-snapshots";
import { SubvolumeQuota } from "./subvolume-quota";
import { exists } from "@cocalc/backend/misc/async-utils-node";

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:btrfs:subvolume");

interface Options {
  filesystem: Filesystem;
  name: string;
}

export class Subvolume {
  public readonly name: string;

  public readonly filesystem: Filesystem;
  public readonly path: string;
  public readonly fs: SubvolumeFilesystem;
  public readonly bup: SubvolumeBup;
  public readonly snapshots: SubvolumeSnapshots;
  public readonly quota: SubvolumeQuota;

  constructor({ filesystem, name }: Options) {
    this.filesystem = filesystem;
    this.name = name;
    this.path = join(filesystem.opts.mount, name);
    this.fs = new SubvolumeFilesystem(this);
    this.bup = new SubvolumeBup(this);
    this.snapshots = new SubvolumeSnapshots(this);
    this.quota = new SubvolumeQuota(this);
  }

  init = async () => {
    if (!(await exists(this.path))) {
      logger.debug(`creating ${this.name} at ${this.path}`);
      await sudo({
        command: "btrfs",
        args: ["subvolume", "create", this.path],
      });
      await this.chown(this.path);
      await this.quota.set(
        this.filesystem.opts.defaultSize ?? DEFAULT_SUBVOLUME_SIZE,
      );
    }
  };

  close = () => {
    // @ts-ignore
    delete this.filesystem;
    // @ts-ignore
    delete this.name;
    // @ts-ignore
    delete this.path;
    // @ts-ignore
    delete this.snapshotsDir;
    for (const sub of ["fs", "bup", "snapshots", "quota"]) {
      this[sub].close?.();
      delete this[sub];
    }
  };

  private chown = async (path: string) => {
    await sudo({
      command: "chown",
      args: [`${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`, path],
    });
  };

  // this should provide a path that is guaranteed to be
  // inside this.path on the filesystem or throw error
  // [ ] TODO: not sure if the code here is sufficient!!
  normalize = (path: string) => {
    return join(this.path, normalize(path));
  };
}

const cache = refCache<Options & { noCache?: boolean }, Subvolume>({
  name: "btrfs-subvolumes",
  createKey: ({ name }) => name,
  createObject: async (options: Options) => {
    const subvolume = new Subvolume(options);
    await subvolume.init();
    return subvolume;
  },
});

export async function subvolume(
  options: Options & { noCache?: boolean },
): Promise<Subvolume> {
  return await cache(options);
}
