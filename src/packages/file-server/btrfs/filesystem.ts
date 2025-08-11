/*
BTRFS Filesystem

DEVELOPMENT:

Start node, then:

DEBUG="cocalc:*file-server*" DEBUG_CONSOLE=yes node

a = require('@cocalc/file-server/btrfs'); fs = await a.filesystem({device:'/tmp/btrfs.img', formatIfNeeded:true, mount:'/mnt/btrfs', uid:293597964})

*/

import refCache from "@cocalc/util/refcache";
import { mkdirp, btrfs, sudo } from "./util";
import { join } from "path";
import { Subvolumes } from "./subvolumes";
import { mkdir } from "fs/promises";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import rustic from "@cocalc/backend/sandbox/rustic";
import { RUSTIC } from "./subvolume-rustic";

export interface Options {
  // the underlying block device.
  // If this is a file (or filename) ending in .img, then it's a sparse file mounted as a loopback device.
  // If this starts with "/dev" then it is a raw block device.
  device: string;
  // where to mount the btrfs filesystem
  mount: string;
  // size -- if true and 'device' is a path to a .img file that DOES NOT EXIST, create device
  // as a sparse image file of the given size.  If img already exists, it will not be touched
  // in any way, and it is up to you to mkfs.btrfs it, etc.
  size?: string | number;
}

export class Filesystem {
  public readonly opts: Options;
  public readonly rustic: string;
  public readonly subvolumes: Subvolumes;

  constructor(opts: Options) {
    this.opts = opts;
    this.rustic = join(this.opts.mount, RUSTIC);
    this.subvolumes = new Subvolumes(this);
  }

  init = async () => {
    await mkdirp([this.opts.mount]);
    await this.initDevice();
    await this.mountFilesystem();
    await btrfs({
      args: ["quota", "enable", "--simple", this.opts.mount],
    });
    await this.initRustic();
    await this.sync();
  };

  sync = async () => {
    await btrfs({ args: ["filesystem", "sync", this.opts.mount] });
  };

  unmount = async () => {
    await sudo({
      command: "umount",
      args: [this.opts.mount],
      err_on_exit: true,
    });
  };

  close = () => {};

  private initDevice = async () => {
    if (!isImageFile(this.opts.device)) {
      // raw block device -- nothing to do
      return;
    }
    if (!(await exists(this.opts.device))) {
      if (!this.opts.size) {
        throw Error(
          "you must specify the size of the btrfs sparse image file, or explicitly create and format it",
        );
      }
      // we create and format the sparse image
      await sudo({
        command: "truncate",
        args: ["-s", `${this.opts.size}`, this.opts.device],
      });
      await sudo({ command: "mkfs.btrfs", args: [this.opts.device] });
    }
  };

  info = async (): Promise<{ [field: string]: string }> => {
    const { stdout } = await btrfs({
      args: ["subvolume", "show", this.opts.mount],
    });
    const obj: { [field: string]: string } = {};
    for (const x of stdout.split("\n")) {
      const i = x.indexOf(":");
      if (i == -1) continue;
      obj[x.slice(0, i).trim()] = x.slice(i + 1).trim();
    }
    return obj;
  };

  private mountFilesystem = async () => {
    try {
      await this.info();
      // already mounted
      return;
    } catch {}
    const { stderr, exit_code } = await this._mountFilesystem();
    if (exit_code) {
      throw Error(stderr);
    }
  };

  private _mountFilesystem = async () => {
    const args: string[] = isImageFile(this.opts.device) ? ["-o", "loop"] : [];
    args.push(
      "-o",
      "compress=zstd",
      "-o",
      "noatime",
      "-o",
      "space_cache=v2",
      "-o",
      "autodefrag",
      this.opts.device,
      "-t",
      "btrfs",
      this.opts.mount,
    );
    {
      const { stderr, exit_code } = await sudo({
        command: "mount",
        args,
        err_on_exit: false,
      });
      if (exit_code) {
        return { stderr, exit_code };
      }
    }
    const { stderr, exit_code } = await sudo({
      command: "chown",
      args: [
        `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
        this.opts.mount,
      ],
      err_on_exit: false,
    });
    return { stderr, exit_code };
  };

  private initRustic = async () => {
    if (await exists(this.rustic)) {
      return;
    }
    await mkdir(this.rustic);
    await rustic(["init"], { repo: this.rustic });
  };
}

function isImageFile(name: string) {
  if (name.startsWith("/dev")) {
    return false;
  }
  // TODO: could probably check os for a device with given name?
  return name.endsWith(".img");
}

const cache = refCache<Options & { noCache?: boolean }, Filesystem>({
  name: "btrfs-filesystems",
  createObject: async (options: Options) => {
    const filesystem = new Filesystem(options);
    await filesystem.init();
    return filesystem;
  },
});

export async function filesystem(
  options: Options & { noCache?: boolean },
): Promise<Filesystem> {
  return await cache(options);
}
