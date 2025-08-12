/*
A subvolume
*/

import { type Filesystem } from "./filesystem";
import refCache from "@cocalc/util/refcache";
import { sudo } from "./util";
import { join } from "path";
import { SubvolumeRustic } from "./subvolume-rustic";
import { SubvolumeSnapshots } from "./subvolume-snapshots";
import { SubvolumeQuota } from "./subvolume-quota";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
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
  public readonly fs: SandboxedFilesystem;
  public readonly rustic: SubvolumeRustic;
  public readonly snapshots: SubvolumeSnapshots;
  public readonly quota: SubvolumeQuota;

  constructor({ filesystem, name }: Options) {
    this.filesystem = filesystem;
    this.name = name;
    this.path = join(filesystem.opts.mount, name);
    this.fs = new SandboxedFilesystem(this.path, {
      rusticRepo: filesystem.opts.rustic,
      host: this.name,
    });
    this.rustic = new SubvolumeRustic(this);
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
    for (const sub of ["fs", "rustic", "snapshots", "quota"]) {
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
