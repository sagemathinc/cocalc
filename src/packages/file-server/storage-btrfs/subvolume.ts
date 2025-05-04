/*
A subvolume
*/

import { type Filesystem } from "./filesystem";
import refCache from "@cocalc/util/refcache";
import { exists, sudo } from "@cocalc/file-server/storage-zfs/util";
import { join } from "path";

interface Options {
  filesystem: Filesystem;
  name: string;
}

export class Subvolume {
  private filesystem: Filesystem;
  private name: string;
  private path: string;

  constructor({ filesystem, name }: Options) {
    this.filesystem = filesystem;
    this.name = name;
    this.path = join(filesystem.opts.mount, name);
  }

  init = async () => {
    if (!(await exists(this.path))) {
      await sudo({
        command: "btrfs",
        args: ["subvolume", "create", this.path],
      });
      if (this.filesystem.opts.uid) {
        await sudo({
          command: "chown",
          args: [
            `${this.filesystem.opts.uid}:${this.filesystem.opts.uid}`,
            this.path,
          ],
        });
      }
    }
  };

  close = () => {
    // @ts-ignore
    delete this.filesystem;
    // @ts-ignore
    delete this.name;
    // @ts-ignore
    delete this.path;
  };
}

const cache = refCache<Options & { noCache?: boolean }, Subvolume>({
  name: "btrfs-subvolumes",
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
