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
import { executeCode } from "@cocalc/backend/execute-code";

// default size of btrfs filesystem if creating an image file.
const DEFAULT_FILESYSTEM_SIZE = "10G";

// default for newly created subvolumes
export const DEFAULT_SUBVOLUME_SIZE = "1G";

const MOUNT_ERROR = "wrong fs type, bad option, bad superblock";

export interface Options {
  // the underlying block device.
  // If this is a file (or filename) ending in .img, then it's a sparse file mounted as a loopback device.
  // If this starts with "/dev" then it is a raw block device.
  device: string;
  // formatIfNeeded -- DANGEROUS! if true, format the device or image,
  // if it doesn't mount with an error containing "wrong fs type,
  // bad option, bad superblock".  Never use this in production.  Useful
  // for testing and dev.
  formatIfNeeded?: boolean;
  // where the btrfs filesystem is mounted
  mount: string;

  // default size of newly created subvolumes
  defaultSize?: string | number;
  defaultFilesystemSize?: string | number;
}

export class Filesystem {
  public readonly opts: Options;
  public readonly bup: string;
  public readonly subvolumes: Subvolumes;

  constructor(opts: Options) {
    opts = {
      defaultSize: DEFAULT_SUBVOLUME_SIZE,
      defaultFilesystemSize: DEFAULT_FILESYSTEM_SIZE,
      ...opts,
    };
    this.opts = opts;
    this.bup = join(this.opts.mount, "bup");
    this.subvolumes = new Subvolumes(this);
  }

  init = async () => {
    await mkdirp([this.opts.mount]);
    await this.initDevice();
    await this.mountFilesystem();
    await btrfs({
      args: ["quota", "enable", "--simple", this.opts.mount],
    });
    await this.initBup();
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
      await sudo({
        command: "truncate",
        args: ["-s", `${this.opts.defaultFilesystemSize}`, this.opts.device],
      });
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
      if (stderr.includes(MOUNT_ERROR)) {
        if (this.opts.formatIfNeeded) {
          await this.formatDevice();
          const { stderr, exit_code } = await this._mountFilesystem();
          if (exit_code) {
            throw Error(stderr);
          } else {
            return;
          }
        }
      }
      throw Error(stderr);
    }
  };

  private formatDevice = async () => {
    await sudo({ command: "mkfs.btrfs", args: [this.opts.device] });
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

  private initBup = async () => {
    if (!(await exists(this.bup))) {
      await mkdir(this.bup);
    }
    await executeCode({
      command: "bup",
      args: ["init"],
      env: { BUP_DIR: this.bup },
    });
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
